const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.FRONTEND_PORT || 4173);
const outputDir = path.resolve(__dirname, '..', '.dist');

app.use(express.static(outputDir, { extensions: ['html'] }));
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(outputDir, 'index.html'));
});

app.listen(port, () => {
    console.log(`Notezilla static preview: http://127.0.0.1:${port}`);
});
