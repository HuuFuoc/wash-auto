import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ChatMessageRole = 'user' | 'model';

export interface IChatMessage {
  role: ChatMessageRole;
  content: string;
  created_at: Date;
}

export type ChatSessionDocument = HydratedDocument<ChatSession>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'chat_sessions',
})
export class ChatSession {
  /** Owner if the session was started by a logged-in user. */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  customer_id: Types.ObjectId | null;

  /** Client-known session id used by the FE to resume the same thread. */
  @Prop({ required: true, unique: true, index: true })
  session_id: string;

  @Prop({
    type: [
      {
        _id: false,
        role: { type: String, enum: ['user', 'model'], required: true },
        content: { type: String, required: true },
        created_at: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  messages: IChatMessage[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
