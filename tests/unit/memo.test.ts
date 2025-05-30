import { describe, it, expect } from 'vitest';
import { MemoFactory } from '../../src/core/entities/memo';

describe('Memo Entity', () => {
  it('should create a new memo with default empty content', () => {
    const memo = MemoFactory.create();
    
    expect(memo.id).toBeDefined();
    expect(memo.content).toBe('');
    expect(memo.timestamp).toBeGreaterThan(0);
  });

  it('should create a new memo with provided content', () => {
    const content = '# Hello World';
    const memo = MemoFactory.create(content);
    
    expect(memo.id).toBeDefined();
    expect(memo.content).toBe(content);
    expect(memo.timestamp).toBeGreaterThan(0);
  });

  it('should reconstruct a memo from existing data', () => {
    const existingData = {
      id: 'test-id',
      content: '# Test Content',
      timestamp: 1234567890,
    };
    
    const memo = MemoFactory.fromData(existingData);
    
    expect(memo.id).toBe(existingData.id);
    expect(memo.content).toBe(existingData.content);
    expect(memo.timestamp).toBe(existingData.timestamp);
  });

  it('should handle partial data when reconstructing', () => {
    const partialData = {
      id: 'test-id',
    };
    
    const memo = MemoFactory.fromData(partialData);
    
    expect(memo.id).toBe(partialData.id);
    expect(memo.content).toBe('');
    expect(memo.timestamp).toBeGreaterThan(0);
  });
});
