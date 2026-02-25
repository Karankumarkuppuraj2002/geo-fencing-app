const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const zonesRouter = require('./routes/zones');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/geofence', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

app.use('/api/zones', zonesRouter);


app.listen(3000, () => console.log('Server running on port 3000'));
