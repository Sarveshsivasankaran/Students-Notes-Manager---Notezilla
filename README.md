# 📝 Notezilla 2.0

**Notezilla** is a premium student notes manager with full-stack capabilities. It features a beautiful UI, secure user authentication, and MongoDB database integration for persistent data storage.

## ✨ Features

- 🎨 **Modern Purple Theme**: Elegant design matching professional educational institutions
- 🔐 **User Authentication**: Secure signup and login with JWT tokens and bcrypt password hashing
- 📝 **Complete CRUD Operations**: Create, read, update, and delete notes seamlessly
- 📂 **Smart Organization**: Organize notes by categories and mark as favorites
- 🔍 **Real-time Search**: Find notes instantly as you type
- 💾 **MongoDB Database**: Cloud-ready database for reliable data persistence
- 🌓 **Dark Mode**: Smooth theme switching for comfortable viewing
- ⚡ **Lightweight & Fast**: No heavy frameworks, just pure HTML, CSS, and JavaScript
- 📱 **Responsive Design**: Works beautifully on all devices

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v14 or higher)
- **MongoDB** (Local or MongoDB Atlas Cloud)
- **npm** or **yarn**

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd notezilla
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your MongoDB URI:
```env
MONGODB_URI=mongodb://localhost:27017/notezilla
JWT_SECRET=your_secret_key_here
PORT=3000
```

4. **Start MongoDB** (if using local instance)
```bash
# Make sure MongoDB service is running on your system
```

5. **Start the server**
```bash
npm run dev
```

The server will run on `http://localhost:3000`

6. **Open the application**
Open your browser and go to:
```
http://localhost:3000/public/login.html
```

## 📋 Project Structure

```
notezilla/
├── models/
│   └── schemas.js          # MongoDB schemas for User and Note
├── public/
│   ├── login.html          # Login page
│   ├── signup.html         # Sign up page
│   ├── app.js              # Main application logic
│   ├── style.css           # Stylesheet
│   └── script.js           # Legacy script (kept for reference)
├── index.html              # Main dashboard
├── server.js               # Express server with API routes
├── package.json            # Dependencies and scripts
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## 🔧 API Endpoints

### Authentication
- **POST** `/api/auth/signup` - Register new user
- **POST** `/api/auth/login` - Login user
- **GET** `/api/auth/verify` - Verify JWT token

### Notes
- **GET** `/api/notes` - Get all user notes
- **POST** `/api/notes` - Create new note
- **PUT** `/api/notes/:id` - Update note
- **DELETE** `/api/notes/:id` - Delete note

## 🔐 Authentication Flow

1. **Sign Up**: User registers with email and password
   - Password is hashed with bcrypt
   - User record saved to MongoDB
   - JWT token generated and returned

2. **Login**: User logs in with credentials
   - Password verified against hash
   - JWT token generated with 7-day expiration
   - Token stored in localStorage

3. **Protected Routes**: API endpoints verify JWT token
   - Token checked in Authorization header
   - User ID extracted from token payload
   - User can only access their own notes

## 💾 Database Schema

### User Schema
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required, hashed),
  college: String,
  department: String,
  semester: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Note Schema
```javascript
{
  userId: ObjectId (reference to User),
  title: String (required),
  category: String,
  content: String,
  isFavorite: Boolean,
  isArchived: Boolean,
  color: String,
  createdAt: Date,
  updatedAt: Date
}
```

## 🎨 UI/UX Features

- **Sidebar Navigation**: Easy access to all notes, favorites, and archived items
- **User Profile Card**: Shows logged-in user's name and email
- **Search Functionality**: Real-time search across titles, content, and categories
- **Category Filtering**: Quick filter by subject or topic
- **Note Actions**: Edit, delete, and favorite notes directly from cards
- **Modal Editor**: Comfortable interface for creating and editing notes
- **Theme Toggle**: Switch between light and dark modes

## 🛠 Development

### Run in development mode with auto-reload:
```bash
npm run dev
```

### Run in production:
```bash
npm start
```

## 📦 Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken), bcryptjs
- **Icons**: Lucide Icons

## 🔒 Security Features

- ✅ Password hashing with bcryptjs
- ✅ JWT token-based authentication
- ✅ CORS protection
- ✅ Protected API endpoints
- ✅ Automatic token expiration (7 days)
- ✅ Input validation

## 📝 Usage Examples

### Create a Note
1. Login to your account
2. Click "New Note" button
3. Fill in title, category, and content
4. Click "Save Note"

### Search and Filter
1. Use search bar to find notes by title or content
2. Use category buttons to filter by subject
3. Click "Favorites" to see starred notes

### Manage Notes
- **Favorite**: Click star icon to mark important notes
- **Edit**: Click edit icon to modify note
- **Delete**: Click trash icon to remove note

## 🚀 Deployment

### Deploy to Heroku:
```bash
heroku create your-app-name
heroku addons:create mongolab:sandbox
git push heroku main
```

### Deploy to Vercel (Frontend Only):
Frontend files in `public/` can be deployed separately to Vercel or any static host.

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 👨‍💻 Author

Built with ❤️ by the Notezilla Team

---

**Happy Note Taking!** 📚✨
