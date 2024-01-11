import express from 'express';
import { takeNotes } from 'index.js';

function main() {
    const app = express();
    const port = process.env.PORT || 8000;

    app.use(express.json());
    
    app.get('/', (_req, res) => {
        // health check
        res.send('Hello!');
    });

    app.post('/take_notes', async (req, res) => {
        const { pdfUrl, name, pagesToDelete } = req.body;
        const notes = await takeNotes({ pdfUrl, name, pagesToDelete });
        res.status(200).send(notes);
        return;
    });

    app.listen(port, () => {
        console.log(`Listening on port ${port}...`);
    });
}

main();
