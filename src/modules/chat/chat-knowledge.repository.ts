import { Types } from 'mongoose';
import {
  ChatKnowledgeDocument,
  ChatKnowledgeModel,
} from './chat-knowledge.model';

export interface ICreateChatKnowledgeInput {
  question: string;
  answer: string;
  keywords?: string[];
  category?: string;
}

export interface IUpdateChatKnowledgeInput {
  question?: string;
  answer?: string;
  keywords?: string[];
  category?: string;
  isActive?: boolean;
}

export class ChatKnowledgeRepository {
  findAll(): Promise<ChatKnowledgeDocument[]> {
    return ChatKnowledgeModel.find().sort({ category: 1, question: 1 }).exec();
  }

  findById(id: Types.ObjectId | string): Promise<ChatKnowledgeDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return ChatKnowledgeModel.findById(id).exec();
  }

  existsByQuestion(question: string): Promise<boolean> {
    return ChatKnowledgeModel.exists({ question: question.trim() })
      .exec()
      .then((r) => r !== null);
  }

  create(input: ICreateChatKnowledgeInput): Promise<ChatKnowledgeDocument> {
    return ChatKnowledgeModel.create({
      question: input.question.trim(),
      answer: input.answer.trim(),
      keywords: input.keywords ?? [],
      category: input.category,
    });
  }

  update(
    id: Types.ObjectId | string,
    input: IUpdateChatKnowledgeInput,
  ): Promise<ChatKnowledgeDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.question !== undefined) update.question = input.question.trim();
    if (input.answer !== undefined) update.answer = input.answer.trim();
    if (input.keywords !== undefined) update.keywords = input.keywords;
    if (input.category !== undefined) update.category = input.category;
    if (input.isActive !== undefined) update.is_active = input.isActive;
    return ChatKnowledgeModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  deleteById(id: Types.ObjectId | string): Promise<{ deletedCount?: number }> {
    return ChatKnowledgeModel.deleteOne({ _id: id }).exec();
  }

  /**
   * Full-text search over question/answer/keywords. Falls back to a regex
   * scan if Mongo returns no $text matches.
   */
  async search(query: string, limit: number): Promise<ChatKnowledgeDocument[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const textHits = await ChatKnowledgeModel.find(
      { is_active: true, $text: { $search: trimmed } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .exec();
    if (textHits.length > 0) return textHits;

    const regex = new RegExp(this.escapeRegex(trimmed), 'i');
    return ChatKnowledgeModel.find({
      is_active: true,
      $or: [{ question: regex }, { answer: regex }, { keywords: regex }],
    })
      .limit(limit)
      .exec();
  }

  /** Bulk upsert by question - used by the seeder so re-runs are safe. */
  async upsertByQuestion(
    entries: ICreateChatKnowledgeInput[],
  ): Promise<number> {
    let inserted = 0;
    for (const entry of entries) {
      const existed = await ChatKnowledgeModel.findOneAndUpdate(
        { question: entry.question.trim() },
        {
          $setOnInsert: {
            question: entry.question.trim(),
            answer: entry.answer.trim(),
            keywords: entry.keywords ?? [],
            category: entry.category,
            is_active: true,
          },
        },
        { upsert: true, new: false },
      ).exec();
      if (!existed) inserted++;
    }
    return inserted;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
