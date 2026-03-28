#!/bin/bash
# Semantic color migration script for dark mode support
# This script applies replacements to all .tsx files under src/

cd /Users/maxbrych/Documents/privat/side_projects/DAO_test/dao-app

# Find all .tsx files
find src -name "*.tsx" -type f | while read file; do
  # Skip files that shouldn't be modified (landesmeisterschaft components are dark-themed already)
  # We'll still process them but the replacements won't match dark-theme patterns

  # Apply replacements using sed
  # NOTE: We use word boundaries carefully to avoid partial matches

  # --- BACKGROUND COLORS ---
  # bg-white -> bg-card (but NOT bg-white/XX opacity variants used in overlays)
  sed -i '' 's/\bbg-white\b/bg-card/g' "$file"

  # bg-gray-50 -> bg-muted (general) or bg-background (page backgrounds)
  # We'll use bg-muted for most, and handle page backgrounds separately
  sed -i '' 's/\bbg-gray-50\b/bg-muted/g' "$file"

  # bg-gray-100 -> bg-muted
  sed -i '' 's/\bbg-gray-100\b/bg-muted/g' "$file"

  # bg-gray-200 -> bg-muted
  sed -i '' 's/\bbg-gray-200\b/bg-muted/g' "$file"

  # bg-gray-900 (used as button bg) -> bg-foreground
  # Be careful: bg-gray-900 in dark themes (like login page) should stay
  sed -i '' 's/\bbg-gray-900\b/bg-foreground/g' "$file"

  # --- TEXT COLORS ---
  # text-black -> text-foreground
  sed -i '' 's/\btext-black\b/text-foreground/g' "$file"

  # text-gray-900 -> text-foreground
  sed -i '' 's/\btext-gray-900\b/text-foreground/g' "$file"

  # text-gray-800 -> text-foreground
  sed -i '' 's/\btext-gray-800\b/text-foreground/g' "$file"

  # text-gray-700 -> text-foreground
  sed -i '' 's/\btext-gray-700\b/text-foreground/g' "$file"

  # text-gray-600 -> text-muted-foreground
  sed -i '' 's/\btext-gray-600\b/text-muted-foreground/g' "$file"

  # text-gray-500 -> text-muted-foreground
  sed -i '' 's/\btext-gray-500\b/text-muted-foreground/g' "$file"

  # text-gray-400 -> text-muted-foreground
  sed -i '' 's/\btext-gray-400\b/text-muted-foreground/g' "$file"

  # text-gray-300 -> text-muted-foreground
  sed -i '' 's/\btext-gray-300\b/text-muted-foreground/g' "$file"

  # --- BORDER COLORS ---
  # border-gray-200 -> border-border
  sed -i '' 's/\bborder-gray-200\b/border-border/g' "$file"

  # border-gray-300 -> border-border
  sed -i '' 's/\bborder-gray-300\b/border-border/g' "$file"

  # border-gray-100 -> border-border
  sed -i '' 's/\bborder-gray-100\b/border-border/g' "$file"

  # --- HOVER BACKGROUNDS ---
  # hover:bg-gray-50 -> hover:bg-accent
  sed -i '' 's/\bhover:bg-gray-50\b/hover:bg-accent/g' "$file"

  # hover:bg-gray-100 -> hover:bg-accent
  sed -i '' 's/\bhover:bg-gray-100\b/hover:bg-accent/g' "$file"

  # hover:bg-gray-200 -> hover:bg-accent
  sed -i '' 's/\bhover:bg-gray-200\b/hover:bg-accent/g' "$file"

  # hover:bg-gray-800 -> hover:bg-foreground/90
  sed -i '' 's/\bhover:bg-gray-800\b/hover:bg-foreground\/90/g' "$file"

  # hover:bg-black -> hover:bg-foreground
  sed -i '' 's/\bhover:bg-black\b/hover:bg-foreground/g' "$file"

  # --- HOVER TEXT ---
  # hover:text-gray-900 -> hover:text-foreground
  sed -i '' 's/\bhover:text-gray-900\b/hover:text-foreground/g' "$file"

  # hover:text-gray-600 -> hover:text-foreground
  sed -i '' 's/\bhover:text-gray-600\b/hover:text-foreground/g' "$file"

  # --- DIVIDE ---
  # divide-gray-200 -> divide-border
  sed -i '' 's/\bdivide-gray-200\b/divide-border/g' "$file"

  # divide-gray-100 -> divide-border
  sed -i '' 's/\bdivide-gray-100\b/divide-border/g' "$file"

  # --- RING ---
  # ring-gray-300 -> ring-border
  sed -i '' 's/\bring-gray-300\b/ring-border/g' "$file"

  # --- PLACEHOLDER ---
  # placeholder-gray-400 -> placeholder-muted-foreground
  sed -i '' 's/\bplaceholder-gray-400\b/placeholder-muted-foreground/g' "$file"

  # placeholder-gray-500 -> placeholder-muted-foreground
  sed -i '' 's/\bplaceholder-gray-500\b/placeholder-muted-foreground/g' "$file"

  # --- LINK/ACCENT COLORS ---
  # text-blue-600 (links) -> text-primary
  sed -i '' 's/\btext-blue-600\b/text-primary/g' "$file"

  # hover:text-blue-800 -> hover:text-primary/80
  sed -i '' 's/\bhover:text-blue-800\b/hover:text-primary\/80/g' "$file"

  # hover:text-blue-500 -> hover:text-primary/80
  sed -i '' 's/\bhover:text-blue-500\b/hover:text-primary\/80/g' "$file"

  # focus:ring-blue-500 -> focus:ring-ring
  sed -i '' 's/\bfocus:ring-blue-500\b/focus:ring-ring/g' "$file"

  # focus:border-blue-500 -> focus:border-ring
  sed -i '' 's/\bfocus:border-blue-500\b/focus:border-ring/g' "$file"

done

echo "Migration complete!"
