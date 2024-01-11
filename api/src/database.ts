import { SupabaseClient, createClient } from "@supabase/supabase-js";
import {Database } from 'generated/db.js';
import { Document } from "langchain/document";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ArxivPaperNote } from "prompts.js";

export const ARXIV_EMBEDDINGS_TABLE = "arxiv_embeddings";
export const ARXIV_PAPERS_TABLE = "arxiv_papers";
export const ARXIV_QA_TABLE = "arxiv_question_answering";

export class SupabaseDatabase {
    vectorStore: SupabaseVectorStore;

    client: SupabaseClient<Database, 'public', any>;

    constructor(
        vectorStore: SupabaseVectorStore,
        client: SupabaseClient<Database, 'public', any>,
    ) {
        this.vectorStore = vectorStore;
        this.client = client;
    }

    static async fromDocuments(
        documents: Array<Document>,
    ): Promise<SupabaseDatabase> {
        const privateKey = process.env.SUPABASE_PRIVATE_KEY;
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!privateKey || !supabaseUrl) {
            throw new Error("Missing SUPABASE_PRIVATE_KEY or SUPABASE_URL");
        }

        const supabase = createClient(supabaseUrl, privateKey);

        const vectorStore = await SupabaseVectorStore.fromDocuments(
            documents,
            new OpenAIEmbeddings(),
            {
                client: supabase,
                tableName: ARXIV_EMBEDDINGS_TABLE,
                queryName: "match_documents",
            }
        )

        return new SupabaseDatabase(vectorStore, supabase);
    }

    async addPaper({
        pdfUrl,
        name,
        paper,
        notes,
    }: {
        pdfUrl: string;
        name: string;
        paper: string;
        notes: ArxivPaperNote[];
    }) {
        const { data, error } = await this.client
            .from(ARXIV_PAPERS_TABLE)
            .insert([
                {
                    arxiv_url: pdfUrl,
                    name,
                    paper,
                    notes,
                },
            ]).select();
        if (error) {
            throw error;
        }
        console.log(data);
        return data;
    }
}
