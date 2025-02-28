const express = require('express')
const app = express()
const fs = require('fs')
const path = require('path')
const PORT = 3000

app.use(express.static('public'))

app.get('/', (req, res)=>{
    res.sendFile(path.join(__dirname, 'html', 'air-quality-dashboard_2.html'))
})

app.listen(PORT, ()=>{
    console.log(`Server is running on port ${PORT}`)
})