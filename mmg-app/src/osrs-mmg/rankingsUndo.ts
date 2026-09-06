import type { RankingsDraftState } from "./types";

const MAX_UNDO_STEPS = 100;

export class RankingsUndoStack {
  private stack: RankingsDraftState[] = [];

  push(state: RankingsDraftState): void {
    this.stack.push(state);
    if (this.stack.length > MAX_UNDO_STEPS) {
      this.stack.shift();
    }
  }

  pop(): RankingsDraftState | null {
    return this.stack.pop() ?? null;
  }

  clear(): void {
    this.stack = [];
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }
}
