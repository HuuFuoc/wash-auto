import { HydratedDocument, Schema, model } from 'mongoose';

// Plain-Mongoose rewrite of features/chat/entities/chat-knowledge.entity.ts.
export interface ChatKnowledge {
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
  is_active: boolean;
}

export type ChatKnowledgeDocument = HydratedDocument<ChatKnowledge>;

const chatKnowledgeSchema = new Schema<ChatKnowledge>(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [], index: true },
    category: { type: String, trim: true, index: true },
    is_active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'chat_knowledge',
  },
);

// Mongo full-text index across question + answer + keywords. The bot's
// search_knowledge tool relies on $text/$meta to rank hits by relevance.
chatKnowledgeSchema.index(
  { question: 'text', answer: 'text', keywords: 'text' },
  { name: 'chat_knowledge_text_idx', default_language: 'none' },
);

export const ChatKnowledgeModel = model<ChatKnowledge>(
  'ChatKnowledge',
  chatKnowledgeSchema,
);
