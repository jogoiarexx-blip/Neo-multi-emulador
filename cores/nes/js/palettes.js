export const DEFAULT_NES_PALETTE=[0x666666,0x002a88,0x1412a7,0x3b00a4,0x5c007e,0x6e0040,0x6c0600,0x561d00,0x333500,0x0b4800,0x005200,0x004f08,0x00404d,0x000000,0x000000,0x000000,0xadadad,0x155fd9,0x4240ff,0x7527fe,0xa01acc,0xb71e7b,0xb53120,0x994e00,0x6b6d00,0x388700,0x0c9300,0x008f32,0x007c8d,0x000000,0x000000,0x000000,0xfffeff,0x64b0ff,0x9290ff,0xc676ff,0xf36aff,0xfe6ecc,0xfe8170,0xea9e22,0xbcbe00,0x88d800,0x5ce430,0x45e082,0x48cdde,0x4f4f4f,0x000000,0x000000,0xfffeff,0xc0dfff,0xd3d2ff,0xe8c8ff,0xfbc2ff,0xfec4ea,0xfeccc5,0xf7d8a5,0xe4e594,0xcfef96,0xbdf4ab,0xb3f3cc,0xb5ebf2,0xb8b8b8,0x000000,0x000000];
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
function transform(src,{sat=1,contrast=1,brightness=0,warm=0}={}){return src.map(c=>{let r=(c>>16)&255,g=(c>>8)&255,b=c&255;const y=.299*r+.587*g+.114*b;r=y+(r-y)*sat;g=y+(g-y)*sat;b=y+(b-y)*sat;r=(r-128)*contrast+128+brightness+warm;g=(g-128)*contrast+128+brightness;b=(b-128)*contrast+128+brightness-warm;return(clamp(r)<<16)|(clamp(g)<<8)|clamp(b)})}
export const PALETTES={
 neo:DEFAULT_NES_PALETTE,
 consumer:transform(DEFAULT_NES_PALETTE,{sat:.92,contrast:.96,warm:4}),
 rgb:transform(DEFAULT_NES_PALETTE,{sat:1.10,contrast:1.04}),
 unsaturated:transform(DEFAULT_NES_PALETTE,{sat:.72,contrast:.98}),
 composite:transform(DEFAULT_NES_PALETTE,{sat:.86,contrast:.94,brightness:2,warm:2})
};
export function parsePalBytes(bytes){const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(u.length<192)throw new Error('Paleta .pal deve conter ao menos 192 bytes (64 cores RGB).');const out=[];for(let i=0;i<64;i++)out.push((u[i*3]<<16)|(u[i*3+1]<<8)|u[i*3+2]);return out}
