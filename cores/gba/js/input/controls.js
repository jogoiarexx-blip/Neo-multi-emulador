export class Controls {
  constructor(memory) {
    this.memory = memory;
    this.keys = new Set();
    this.gamepadState = 0x03FF;
    this.map = {
      ArrowRight:0, ArrowLeft:1, ArrowUp:2, ArrowDown:3,
      KeyZ:4, KeyX:5, KeyA:6, KeyS:7,
      Enter:8, ShiftRight:9, ShiftLeft:9
    };

    if (typeof addEventListener === "function") {
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
      addEventListener("blur", () => { this.keys.clear(); this.gamepadState = 0x03FF; this.sync(); });
    }
    this.sync();
  }

  pollGamepad() {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    // Rebuild from the released state every poll so released buttons never stick.
    let keyinput = 0x03FF;
    if (gp) {
      const press = (bit, on) => { if (on) keyinput &= ~(1 << bit); };
      press(0, gp.buttons[15]?.pressed || gp.axes[0] > 0.5);
      press(1, gp.buttons[14]?.pressed || gp.axes[0] < -0.5);
      press(2, gp.buttons[12]?.pressed || gp.axes[1] < -0.5);
      press(3, gp.buttons[13]?.pressed || gp.axes[1] > 0.5);
      press(4, gp.buttons[0]?.pressed);
      press(5, gp.buttons[1]?.pressed);
      press(6, gp.buttons[4]?.pressed);
      press(7, gp.buttons[5]?.pressed);
      press(8, gp.buttons[9]?.pressed);
      press(9, gp.buttons[8]?.pressed);
    }
    this.gamepadState = keyinput;
    this.sync();
  }

  sync() {
    let keyinput = this.gamepadState;
    for (const [code, bit] of Object.entries(this.map)) {
      if (this.keys.has(code)) keyinput &= ~(1 << bit);
    }
    this.memory.setKeyInput?.(keyinput);

    const keycnt = this.memory.read16(0x04000132);
    if (!(keycnt & (1 << 14))) return;
    const mask = keycnt & 0x03FF;
    const andMode = !!(keycnt & (1 << 15));
    const pressed = (~keyinput) & 0x03FF;
    const match = andMode ? ((pressed & mask) === mask && mask !== 0) : !!(pressed & mask);
    if (match) this.memory.requestIRQ?.(1 << 12);
  }
}
