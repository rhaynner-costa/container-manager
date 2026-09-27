import express from 'express'
import cors from 'cors'
import path from 'path'
import { apiRouter } from './routes'

const app = express()
const PORT = Number(process.env.PORT ?? 3210)
const isDev = process.env.NODE_ENV === 'development'

app.use(
  cors({
    origin: isDev ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : false
  })
)
app.use(express.json())
app.use('/api', apiRouter)

// Em produção serve o frontend buildado
if (!isDev) {
  const clientDist = path.join(__dirname, '../../dist/client')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Container Manager rodando em http://localhost:${PORT}\n`)
  if (isDev) console.log('  Frontend dev server: http://localhost:5173\n')
})
