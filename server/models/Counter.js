const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Tên của bộ đếm (ví dụ: 'void_post')
  seq: { type: Number, default: 0 }      // Con số hiện tại (0, 1, 2...)
});

module.exports = mongoose.model('Counter', CounterSchema);