import express from 'express';

function main() {
    const app = express();
    const port = process.env.PORT || 8000;
    app.get('/', (_req, res) => {
        // health check
        res.send('Hello!');
    });

    app.listen(port, () => {
        console.log(`Listening on port ${port}...`);
    });
}

main();
