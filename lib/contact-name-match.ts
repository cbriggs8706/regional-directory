function normalizeName(name: string) {
  return name.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "")
    .replace(/['’ʼ.]/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function contactNameMatcher(name: string) {
  const source = Array.from(normalizeName(name));

  return (candidate: string) => {
    const target = Array.from(normalizeName(candidate));
    const length = Math.max(source.length, target.length);
    // An 80% match allows one edit for every five characters.
    const maxEdits = Math.floor(length / 5);
    if (!source.length || !target.length || Math.abs(source.length - target.length) > maxEdits) return null;

    // Count a swapped pair of adjacent characters as one typo.
    let twoRowsBack: number[] = [];
    let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
    for (let row = 1; row <= source.length; row++) {
      const current = [row];
      for (let column = 1; column <= target.length; column++) {
        current[column] = Math.min(
          previous[column] + 1,
          current[column - 1] + 1,
          previous[column - 1] + Number(source[row - 1] !== target[column - 1]),
        );
        if (row > 1 && column > 1 && source[row - 1] === target[column - 2] && source[row - 2] === target[column - 1]) {
          current[column] = Math.min(current[column], twoRowsBack[column - 2] + 1);
        }
      }
      twoRowsBack = previous;
      previous = current;
    }

    const edits = previous[target.length];
    return edits <= maxEdits ? (length - edits) / length : null;
  };
}
