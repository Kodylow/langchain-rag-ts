import axios from 'axios';
import { PDFDocument } from 'pdf-lib';
import { Document} from 'langchain/document';
import { writeFile, unlink } from 'fs/promises';
import { UnstructuredLoader } from 'langchain/document_loaders/fs/unstructured';
import { formatDocumentsAsString } from 'langchain/util/document';
import dotenv from 'dotenv';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ArxivPaperNote, NOTES_TOOL_SCHEMA, NOTE_PROMPT, outputParser } from 'prompts.js';
import { SupabaseDatabase } from 'database.js';

async function deletePages(pdf: Buffer, pagesToDelete: number[]) {
    const pdfDoc = await PDFDocument.load(pdf);
    const pages = pdfDoc.getPages();
    let offset = 1;
    for (const pageNumber of pagesToDelete) {
        pdfDoc.removePage(pageNumber - offset);
        offset++;
    }
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

async function loadPdfFromUrl(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
    });
    return response.data;
}

async function convertPdfToDocuments(pdf: Buffer): Promise<Array<Document>> {
    dotenv.config();
    if (!process.env.UNSTRUCTURED_API_KEY) {
        throw new Error('UNSTRUCTURED_API_KEY is not set');
    } else if (!process.env.UNSTRUCTURED_API_URL) {
        throw new Error('UNSTRUCTURED_API_URL is not set');
    }
    
    const randomName = Math.random().toString(36).substring(7);
    await writeFile(`/tmp/${randomName}.pdf`, pdf, 'binary');
    const loader = new UnstructuredLoader(
        `/tmp/${randomName}.pdf`, 
        {
            apiKey: process.env.UNSTRUCTURED_API_KEY,
            apiUrl: process.env.UNSTRUCTURED_API_URL,
            strategy: 'hi_res'
        }
    );
    const documents = await loader.load();
    await unlink(`/tmp/${randomName}.pdf`);

    return documents;
}

async function generateNotes(documents: Array<Document>): Promise<Array<ArxivPaperNote>> {
    const documentsAsString = formatDocumentsAsString(documents);
    const model = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: 'gpt-4-1106-preview',
        temperature: 0.0,
    })

    const modelWithTool = model.bind({
        tools: [NOTES_TOOL_SCHEMA],
    })

    const chain = NOTE_PROMPT.pipe(modelWithTool).pipe(outputParser);
    const response = await chain.invoke({
        paper: documentsAsString,
    })

    return response;
}

interface MainParams {
    pdfUrl: string;
    name: string;
    pagesToDelete?: number[];
}

async function main({
    pdfUrl,
    name,
    pagesToDelete,
}: MainParams): Promise<Array<ArxivPaperNote>> {
    if (!pdfUrl.endsWith('.pdf')) {
        throw new Error('paperUrl must end with .pdf');
    }

    let pdfAsBuffer = await loadPdfFromUrl(pdfUrl);
    if (pagesToDelete && pagesToDelete.length > 0) {
        pdfAsBuffer = await deletePages(pdfAsBuffer, pagesToDelete);
    }

    const documents = await convertPdfToDocuments(pdfAsBuffer);
    const notes = await generateNotes(documents);
    const database = await SupabaseDatabase.fromDocuments(documents);
    await Promise.all([
        database.addPaper({
            pdfUrl,
            name,
            paper: formatDocumentsAsString(documents),
            notes,
        }),
        database.vectorStore.addDocuments(documents)
    ]);
    console.log('saved notes to database');
    return notes;
}

const res = await main({
    pdfUrl: 'https://arxiv.org/pdf/2305.15334.pdf',
    name: 'gorilla: large language model connected with massive apis',
})
