#!/bin/bash
#
# Generate .icns icon for A-IDE from a 1024x1024 source PNG.
#
# Usage:
#   ./scripts/generate-icon.sh [source.png]
#
# If no source PNG is provided, generates a placeholder icon
# (dark background with blue "A" letter).
#
# Requirements: macOS with sips and iconutil (built-in)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
ICONSET_DIR="$BUILD_DIR/icon.iconset"
OUTPUT="$BUILD_DIR/icon.icns"

mkdir -p "$BUILD_DIR"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

SOURCE_PNG="${1:-}"

# Generate placeholder if no source provided
if [ -z "$SOURCE_PNG" ]; then
  SOURCE_PNG="$BUILD_DIR/_placeholder_1024.png"
  echo "No source PNG provided. Generating placeholder icon..."

  # Create a 1024x1024 placeholder using Python (available on macOS)
  python3 -c "
import struct, zlib

WIDTH, HEIGHT = 1024, 1024
BG = (30, 30, 30)       # #1e1e1e
FG = (0, 122, 204)      # #007acc

# Simple bitmap approach - draw an 'A' using basic geometry
pixels = []
for y in range(HEIGHT):
    row = []
    for x in range(WIDTH):
        # Normalize to 0..1
        nx = x / WIDTH
        ny = y / HEIGHT

        # Draw letter A centered (roughly)
        in_letter = False

        # A shape: two diagonal lines + horizontal bar
        # Left leg: from (0.3, 0.85) to (0.5, 0.15)
        # Right leg: from (0.7, 0.85) to (0.5, 0.15)
        # Bar: y ~ 0.58, from left leg to right leg

        leg_width = 0.065

        # Left leg
        if ny >= 0.15 and ny <= 0.85:
            t = (ny - 0.15) / 0.70
            center_x = 0.5 - t * 0.20
            if abs(nx - center_x) < leg_width:
                in_letter = True

        # Right leg
        if ny >= 0.15 and ny <= 0.85:
            t = (ny - 0.15) / 0.70
            center_x = 0.5 + t * 0.20
            if abs(nx - center_x) < leg_width:
                in_letter = True

        # Horizontal bar
        if ny >= 0.53 and ny <= 0.60:
            t_bar = (0.565 - 0.15) / 0.70
            left_x = 0.5 - t_bar * 0.20
            right_x = 0.5 + t_bar * 0.20
            if nx >= left_x - 0.01 and nx <= right_x + 0.01:
                in_letter = True

        if in_letter:
            row.extend(FG)
        else:
            row.extend(BG)
    pixels.append(bytes(row))

# Encode as PNG
def create_png(width, height, rows):
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack('>I', len(data)) + c + crc

    header = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))

    raw = b''
    for row in rows:
        raw += b'\\x00' + row

    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

png_data = create_png(WIDTH, HEIGHT, pixels)
with open('$SOURCE_PNG', 'wb') as f:
    f.write(png_data)
print('Placeholder PNG generated.')
"
fi

if [ ! -f "$SOURCE_PNG" ]; then
  echo "Error: Source PNG not found: $SOURCE_PNG"
  exit 1
fi

echo "Generating iconset from: $SOURCE_PNG"

# Required icon sizes for macOS .icns
SIZES=(16 32 128 256 512)

for size in "${SIZES[@]}"; do
  retina=$((size * 2))

  # Standard resolution
  sips -z "$size" "$size" "$SOURCE_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" > /dev/null 2>&1

  # Retina (@2x)
  sips -z "$retina" "$retina" "$SOURCE_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" > /dev/null 2>&1
done

echo "Converting iconset to .icns..."
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT"

# Clean up
rm -rf "$ICONSET_DIR"
if [ "$SOURCE_PNG" = "$BUILD_DIR/_placeholder_1024.png" ]; then
  rm -f "$SOURCE_PNG"
fi

echo "Done: $OUTPUT"
