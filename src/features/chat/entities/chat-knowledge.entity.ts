import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatKnowledgeDocument = HydratedDocument<ChatKnowledge>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'chat_knowledge',
})
export class ChatKnowledge {
  /** Canonical phrasing of the question (used for search + display). */
  @Prop({ required: true, trim: true })
  question: string;

  /** Answer the bot may quote or paraphrase. */
  @Prop({ required: true, trim: true })
  answer: string;

  /**
   * Extra match terms (synonyms, brand-specific words). Indexed so the bot
   * finds an entry even when the user phrases the question differently.
   */
  @Prop({ type: [String], default: [], index: true })
  keywords: string[];

  /** Optional grouping label — eg. "pricing", "policy", "service". */
  @Prop({ trim: true, index: true })
  category?: string;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const ChatKnowledgeSchema = SchemaFactory.createForClass(ChatKnowledge);

// Mongo full-text index across question + answer + keywords. The bot's
// search_knowledge tool relies on $text/$meta to rank hits by relevance.
ChatKnowledgeSchema.index(
  { question: 'text', answer: 'text', keywords: 'text' },
  { name: 'chat_knowledge_text_idx', default_language: 'none' },
);
