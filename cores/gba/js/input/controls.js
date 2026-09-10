export class Controls {
  constructor(memory) {
    this.memory = memory;
    this.keys = new Set();
    this.map = {
      ArrowRight:0,
      ArrowLeft:1,
      ArrowUp:2,
      ArrowDown:3,
      KeyZ:4,      // A
      KeyX:5,      // B
      KeyA:6,      // L
      KeyS:7,      // R
      Enter:8,     // Start
      ShiftRight:9,// Select
      ShiftLeft:9
    };

    addEventListener("keydown", e => {
      if (this.map[e.code] !== undefined) e.preventDefault();
      this.keys.add(e.code);
      this.sync();
    });

    addEventListener("keyup", e => {
      if (this.map[e.code] !== undefined) e.preventDefault();
      this.keys.delete(e.code);
      this.sync();
    });

    this.sync();
    this.gamepadState = 0x03FF;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp) return;

    let keyinput = this.gamepadState ?? 0x03FF;
    const press = (bit, on) => { if (on) keyinput &= ~(1<<bit); };

    press(0, gp.buttons[15]?.pressed || gp.axes[0] > 0.5); // Right
    press(1, gp.buttons[14]?.pressed || gp.axes[0] < -0.5); // Left
    press(2, gp.buttons[12]?.pressed || gp.axes[1] < -0.5); // Up
    press(3, gp.buttons[13]?.pressed || gp.axes[1] > 0.5); // Down
    press(4, gp.buttons[0]?.pressed); // A
    press(5, gp.buttons[1]?.pressed); // B
    press(6, gp.buttons[4]?.pressed); // L
    press(7, gp.buttons[5]?.pressed); // R
    press(8, gp.buttons[9]?.pressed); // Start
    press(9, gp.buttons[8]?.pressed); // Select

    this.gamepadState = keyinput;
    this.sync();
  }

  sync() {
    // KEYINPUT: bits baixos = pressionado
    let keyinput = this.gamepadState ?? 0x03FF;
    for (const [code, bit] of Object.entries(this.map)) {
      if (this.keys.has(code)) keyinput &= ~(1 << bit);
    }
    this.memory.write16(0x04000130, keyinput);

    const keycnt = this.memory.read16(0x04000132);
    const irqEnable = !!(keycnt & (1<<14));
    if (!irqEnable) return;

    const mask = keycnt & 0x03FF;
    const andMode = !!(keycnt & (1<<15));
    const pressed = (~keyinput) & 0x03FF;
    const match = andMode ? ((pressed & mask) === mask && mask !== 0) : !!(pressed & mask);

    if (match) {
      let iff = this.memory.read16(0x04000202);
      iff |= (1<<12);
      this.memory.write16(0x04000202, iff);
    }
  }
}
