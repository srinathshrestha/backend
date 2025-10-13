# Srinath's Blog & Portfolio

A minimalist blog and portfolio built with simplicity in mind. No bloated frameworks—just clean, fast, and purposeful code.

**Live Demo:** [srinathshrestha.onrender.com](https://srinathshrestha.onrender.com)

## Features

- **Blog**: Markdown-powered posts with live preview
- **Portfolio**: Clean showcase of projects and experience  
- **Admin Panel**: Simple writer console for managing content
- **Dark Theme**: Consistent, modern aesthetic
- **Fast & Lightweight**: Minimal dependencies, maximum performance

## Tech Stack

- Node.js + Express
- EJS templating
- MongoDB for content storage
- Local file uploads
- Markdown rendering with syntax highlighting

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start the server
npm start
```

## Project Structure

```
src/
├── app.js           # Express application setup
├── server.js        # Server startup & shutdown
├── routes/          # HTTP route definitions
├── controllers/     # Business logic handlers
└── utils/           # Utilities (markdown, uploads, db)
views/               # EJS templates
public/              # Static assets & uploads
```

## Environment Variables

```env
PORT=3000
SITE_URL=http://localhost:3000
ADMIN_PASSWORD=your-secure-password
MONGODB_URI=mongodb://localhost:27017/blog
```

## Deployment

This application is designed for simple deployment:

- **Development**: `npm start`
- **Production**: Use PM2 + Nginx
- **Hosting**: Works well on Render, Railway, or any Node.js platform

## Philosophy

Built with the belief that good software doesn't need complexity. Every line of code serves a purpose, every dependency has a reason.

---

**License**: MIT © Srinath Shrestha