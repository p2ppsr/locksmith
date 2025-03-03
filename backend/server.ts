import express from 'express'
import { Locksmith } from './contracts/Locksmith'

// Initialize Express app
const app = express()

// Middleware for JSON parsing
app.use(express.json())

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Locksmith Backend is Running' })
})

// Example route to test Locksmith
app.get('/locksmith', (req, res) => {
  try {
    res.json({ locksmith: Locksmith }) // Adjust based on actual Locksmith behavior
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

// Set port and start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Locksmith Backend Started on http://localhost:${PORT}`)
})
