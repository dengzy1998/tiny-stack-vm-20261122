// Tiny stack VM: a from-scratch interpreter of make.fun's tiny-stack-vm-01 ISA
// (kit: generator/subject/ISA.md; reference VM generator/subject/vm.mjs).
// Runs every /input/<id>/ program and writes /output/<id>/stdout.bin + exit.txt.
// Node 22, plain JavaScript in a .ts file (no TS-only syntax), no dependencies.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Per-opcode stack effect, indexed by opcode byte: charCode - 33 = pops * 4 + pushes + 1,
// '!' (33) = not an opcode. Covers bytes 0x00..0x53; anything else traps 5.
const PP = `"##&(,-1!!!!!!!!+++++++'+++'+++!+++!!!!!!!!!!!!!"&&""!!!!!!!!!!!'*!!!!!!!!!!!!!!&&#&`;

function run(p, inp) {
  const D = new Int32Array(256); // data stack
  let sp = 0;
  const C = new Int32Array(64); // call stack
  let cp = 0;
  const M = new Int32Array(256); // memory
  const out = new Uint8Array(65536);
  let ol = 0; // output length
  let ip = 0; // input position
  let pc = 0;
  let steps = 0;
  const n = p.length;
  const end = (code) => [out.subarray(0, ol), code];
  for (;;) {
    if (steps === 1000000) return end(10); // step limit, checked first
    if (pc < 0 || pc >= n) return end(9); // pc outside the program
    const op = p[pc];
    const q = op < 84 ? PP.charCodeAt(op) - 33 : 0;
    if (!q) return end(5); // unknown opcode
    const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (pc + imm >= n) return end(9); // immediate cut off by the end
    steps++;
    const nx = pc + 1 + imm;
    const v = q - 1;
    const pops = v >> 2;
    const pushes = v & 3;
    if (sp < pops) return end(2); // stack underflow
    if (sp - pops + pushes > 256) return end(3); // stack overflow
    pc = nx;
    if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) {
      // two-operand arithmetic / logic / comparison
      const b = D[sp - 1];
      const a = D[sp - 2];
      let r;
      if (op === 0x10) r = a + b;
      else if (op === 0x11) r = a - b;
      else if (op === 0x12) r = Math.imul(a, b); // exact low 32 bits
      else if (op === 0x13) {
        if (!b) return end(4);
        r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
      } else if (op === 0x14) {
        if (!b) return end(4);
        r = b === -1 ? 0 : (a % b) | 0;
      } else if (op === 0x15) {
        if (!b) return end(4);
        r = Math.floor((a >>> 0) / (b >>> 0));
      } else if (op === 0x16) {
        if (!b) return end(4);
        r = (a >>> 0) % (b >>> 0);
      } else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = a >>> (b & 31);
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU
      sp -= 2;
      D[sp++] = r;
      continue;
    }
    switch (op) {
      case 0x00:
        return end(0); // HALT
      case 0x01:
        D[sp++] = (p[nx - 1] << 24) >> 24; // PUSH8, sign-extended
        break;
      case 0x02:
        D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); // PUSH32
        break;
      case 0x03:
        sp--; // POP
        break;
      case 0x04:
        D[sp] = D[sp - 1]; sp++; // DUP
        break;
      case 0x05: {
        const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; // SWAP
        break;
      }
      case 0x06:
        D[sp] = D[sp - 2]; sp++; // OVER
        break;
      case 0x07: {
        const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; // ROT
        break;
      }
      case 0x17:
        D[sp - 1] = -D[sp - 1]; // NEG (wraps: -INT_MIN stays INT_MIN)
        break;
      case 0x1b:
        D[sp - 1] = ~D[sp - 1]; // NOT
        break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        if (op === 0x30 || (op === 0x31) === (D[--sp] === 0)) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return end(7); // call stack overflow
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8); // CALL, unsigned target
        break;
      case 0x34:
        if (!cp) return end(8); // RET with an empty call stack
        pc = C[--cp];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return end(6); // LOAD: bad address
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return end(6); // STORE: bad address
        M[a] = D[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]); // PRINT: decimal, no newline
        if (ol + s.length > 65536) return end(11); // output limit: writes nothing
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        sp--;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return end(11); // PUTC: output limit
        out[ol++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = ip < inp.length ? inp[ip++] : -1; // IN: -1 once input is used up
        break;
      case 0x53:
        return end(D[--sp] & 255); // EXIT with the low byte
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [o, c] = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), o);
  writeFileSync(join(O, id, 'exit.txt'), c + '\n');
}
