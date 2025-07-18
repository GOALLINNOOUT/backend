# JC's Closet Backend

Welcome to the backend API server for **JC's Closet**, a modern e-commerce and fashion web application. This project is built with **Node.js**, **Express**, and **MongoDB**. It provides a robust RESTful API for managing products, users, orders, analytics, and more.

---

## Table of Contents

- [Features](#features)
- [Project Structure & File Explanations](#project-structure--file-explanations)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [License](#license)

---

## Features

- **RESTful API** for products, users, orders, reviews, analytics, and more
- **MongoDB** database with Mongoose models
- **User authentication** (JWT) and admin routes
- **Session and page view logging** for analytics
- **AI recommendations** and ML integration endpoints
- **Automated session cleanup** with cron jobs

---

## Project Structure & File Explanations

```
server/
│  index.js                # Main entry point for the Express server
│  package.json            # Project metadata and dependencies
│  sessionCleanup.js       # Cron job for cleaning up expired sessions
│
├─controllers/             # Route handler logic for each API endpoint
│   aiRecommendationController.js   # Handles AI/ML recommendation logic
│   analyticsController.js          # Handles analytics endpoints
│   exportController.js             # Handles data export functionality
│   reviewController.js             # Handles product review endpoints
│   ...
│
├─middleware/              # Express middleware for authentication, logging, etc.
│   auth.js                # JWT authentication middleware
│   pageViewLogger.js      # Logs page views for analytics
│   requireAdmin.js        # Restricts access to admin-only routes
│   sessionLogger.js       # Logs user sessions
│   updateLastActivity.js  # Updates user's last activity timestamp
│
├─models/                  # Mongoose schemas for MongoDB collections
│   Appointment.js         # Appointment data model
│   Article.js             # Article/blog post data model
│   CartActionLog.js       # Logs cart actions for analytics
│   CheckoutEventLog.js    # Logs checkout events
│   Contact.js             # Contact form submissions
│   CustomLookRequest.js   # Requests for custom looks
│   Design.js              # Product design data model
│   Order.js               # Order data model
│   PageViewLog.js         # Page view analytics
│   Perfume.js             # Perfume product data model
│   Review.js              # Product review data model
│   SecurityLog.js         # Security-related logs
│   SessionLog.js          # User session logs
│   Subscriber.js          # Newsletter subscribers
│   User.js                # User account data model
│
├─routes/                  # Express route definitions
│   admin.js               # Admin-only routes
│   aiRecommendations.js   # AI recommendation endpoints
│   analytics.js           # Analytics endpoints
│   appointments.js        # Appointment booking endpoints
│   articles.js            # Article/blog endpoints
│   auth.js                # Authentication (login, register, etc.)
│   cart.js                # Shopping cart endpoints
│   cartActions.js         # Cart action logging
│   checkoutEvents.js      # Checkout event logging
│   contact.js             # Contact form endpoints
│   customLookRequest.js   # Custom look requests
│   designs.js             # Product design endpoints
│   export.js              # Data export endpoints
│   newsletter.js          # Newsletter subscription endpoints
│   orders.js              # Order management endpoints
│   pageViews.js           # Page view analytics
│   perfumes.js            # Perfume product endpoints
│   reviews.js             # Product review endpoints
│   session.js             # Session management endpoints
│   setupPassword.js       # Password setup/reset endpoints
│   user.js                # User profile and management endpoints
│
├─uploads/                 # Uploaded files (e.g., product images)
│   ...
│
├─utils/                   # Utility/helper functions (various purposes)
│   ...
│
└─README.md                # This documentation file
```

---

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Create a `.env` file** in the `server/` directory with your environment variables (see below).
3. **Start the server:**
   ```bash
   npm start
   ```
4. The API will be available at [http://localhost:5000](http://localhost:5000) by default.

---

## Environment Variables

Create a `.env` file in the `server/` directory. Example:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-url>/<dbname>?retryWrites=true&w=majority
PORT=5000
JWT_SECRET=your_jwt_secret
```

---

## Deployment

This backend can be deployed to platforms like **Render**, **Railway**, or **Fly.io**. Make sure to set your environment variables in the deployment dashboard of your chosen platform.

---

## License

MIT
