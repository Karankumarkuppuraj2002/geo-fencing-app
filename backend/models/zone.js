const mongoose = require('mongoose');

const ZoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  coordinates: [
    {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    }
  ],
  isZoneActive: { type: Number, default: 1 },  // 1 = active, 0 = inactive
  isActive: { type: Number, default: 1 },      // same as isZoneActive if needed
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
});

// auto-update `updatedAt` on save
ZoneSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Zone', ZoneSchema);
