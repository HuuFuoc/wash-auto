import { Injectable, OnModuleInit } from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;

  constructor() {
    const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@wdp301project.363enrm.mongodb.net/`;
    this.client = new MongoClient(uri);
    this.db = this.client.db(process.env.DB_NAME);
  }

  async onModuleInit() {
    await this.connect();
  }

  async connect() {
    try {
      await this.db.command({ ping: 1 });
      console.log(
        'Pinged your deployment. You successfully connected to MongoDB!',
      );
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  getDb(): Db {
    return this.db;
  }
}
