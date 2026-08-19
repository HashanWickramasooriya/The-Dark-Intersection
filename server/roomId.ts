const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** Short, human-shareable, collision-checked against currently-live rooms. */
export function generateRoomId(exists: (id: string) => boolean): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = randomCode();
    if (!exists(id)) return id;
  }
  // astronomically unlikely fallback
  return randomCode(10);
}
