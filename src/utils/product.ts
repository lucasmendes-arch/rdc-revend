export function extractVolume(name: string): { baseName: string; volume: string | null } {
  // Matches patterns like " - 300ml", " (1kg)", "250g", " 1L", " - 500G"
  // It separates the quantity from the name if found at the end or explicitly separated
  const regex = /(.+?)(?:\s*[-/(]*\s*(\d+(?:,\d+)?(?:\.\d+)?\s*(?:ml|g|kg|l|L|KG|G|ML))[\s)]*)$/i;
  
  const match = name.match(regex);
  if (match) {
    return {
      baseName: match[1].trim().replace(/[\s-]+$/, ''),
      volume: match[2].trim(),
    };
  }
  
  return { baseName: name, volume: null };
}
