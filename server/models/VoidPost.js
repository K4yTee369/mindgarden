const mongoose = require('mongoose');

const VoidPostSchema = new mongoose.Schema({
  id: { type: Number, unique: true }, 
  content: { type: String },
  author: { type: String, default: "Anonymous" },
  tag: { type: String, default: "General", trim: true },
  images: [{ type: String }], 
  comments: [{
    author: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['pending', 'approved', 'ai_approved', 'admin_approved', 'rejected'], default: 'approved' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VoidPost', VoidPostSchema);