export function ascii(bytes, start, length) {
  let out = "";
  for (let i = start; i < start + length; i++) {
    const v = bytes[i];
    if (!v) continue;
    out += String.fromCharCode(v);
  }
  return out.trim();
}
export function hex(value, width = 2) {
  return "0x" + Number(value).toString(16).toUpperCase().padStart(width, "0");
}
