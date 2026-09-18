const express = require('express');
const path = require('path');
const app = express();
const PORT = 3003;
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: 'index.html' }));
app.use((req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`SPUR UI on :${PORT}`); });
