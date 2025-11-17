const express = require('express');
const router = express.Router();
const Zone = require('../models/zone');

// GET all zones
router.get('/', async (req, res) => {
  const zones = await Zone.find({ deletedAt: null }); // only non-deleted
  res.json(zones);
});

router.post('/', async (req, res) => {
  try {
    const { name, coordinates, isZoneActive, isActive } = req.body;

    const newZone = new Zone({
      name,
      coordinates,
      isZoneActive: isZoneActive ?? 1,
      isActive: isActive ?? 1
    });

    await newZone.save();
    res.json(newZone);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create zone' });
  }
});


// DELETE zone (soft delete with deletedAt)
router.delete('/:id', async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });

    zone.deletedAt = new Date();
    zone.isZoneActive = 0; // mark inactive
    zone.isActive = 0;     // optional if using isActive field
    await zone.save();

    res.json(zone); // return the updated zone
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete zone' });
  }
});


module.exports = router;
