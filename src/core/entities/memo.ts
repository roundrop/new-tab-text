/**
 * Memo entity
 * Core domain object for memos that users edit
 */
export interface Memo {
  id: string;
  content: string;
  timestamp: number;
}

/**
 * Memo factory
 * Static methods for creating new memo instances
 */
export class MemoFactory {
  /**
   * Create new memo instance
   * @param content Memo content
   * @returns New memo object
   */
  static create(content = ""): Memo {
    return {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now(),
    };
  }

  /**
   * Reconstruct memo from existing data
   * @param data Existing memo data
   * @returns Reconstructed memo object
   */
  static fromData(data: Partial<Memo>): Memo {
    return {
      id: data.id || crypto.randomUUID(),
      content: data.content || "",
      timestamp: data.timestamp || Date.now(),
    };
  }
}
