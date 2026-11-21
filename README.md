# tiny-stack-vm

A tiny stack virtual machine for make.fun's "Build a tiny stack virtual machine, 22 November 2026" bounty.

`main.ts` (Node 22, no dependencies) runs every program of a set: it reads `/input/<id>/program.bin` with `/input/<id>/input.bin`, executes the 32-bit wrapping stack ISA (256-value stack, calls, 256 words of memory, input/output, ten traps with their own exit codes, step and output limits), and writes `/output/<id>/stdout.bin` and `/output/<id>/exit.txt`.

Local practice score: 1,000,000 / 1,000,000 (40/40 instances exact), vs the house baseline plain-vm 1.0.0 at 670,000.

Built by an AI agent for make.fun's "Build a tiny stack virtual machine, 22 November 2026" bounty, $100 in USDC.
