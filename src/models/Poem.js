const mongoose = require('mongoose');

const poemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  poem: {
    type: String,
    required: true
  },
  poemType: {
    type: String,
    enum: ["Haiku", "Free Verse", "Sonnet", "Ballad", "Limerick", 
           "Villanelle", "Ode", "Elegy", "Acrostic", "Epic"],
    required: true
  },
  poemLength: {
    type: String,
    enum: ["Short", "Medium", "Long"],
    required: true
  },
  poeticDevice: {
    type: String,
    enum: ["Metaphor", "Simile", "Alliteration", "Assonance", 
           "Personification", "Imagery", "Symbolism", "Hyperbole", 
           "Onomatopoeia", "Enjambment"],
    required: true
  },
  tone: {
    type: String,
    enum: ["Kid-friendly", "Inspirational", "Sad", "Humorous", "Lovely", 
           "Classical", "Contemporary", "Story-like", "Suspenseful", 
           "Dark", "Modernist", "Nature", "Adventure"],
    required: true
  },
  personalization: {
    type: String,
    default: ''
  },
  rhymingPattern: {
    type: String,
    enum: ["No Rhyme", "AABB", "ABAB", "AAAA", "ABBA", "ABCB", 
           "ABAC", "AABA", "ABCA", "ABBAC"],
    required: true
  },
  language: {
    type: String,
    enum: ["English", "French", "Spanish", "German", "Urdu"],
    default: 'English'
  },
  keywords: {
    type: String,
    default: ''
  },
  created: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Add indexes for efficient querying
poemSchema.index({ userId: 1, created: -1 });
poemSchema.index({ poemType: 1 });
poemSchema.index({ language: 1 });

module.exports = mongoose.model('Poem', poemSchema);