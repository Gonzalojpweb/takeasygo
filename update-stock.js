db.storeitems.updateOne(
  { _id: ObjectId('6a11032e39d33b1d73e3aa1d') },
  { $set: { stock: 10 } }
);
print('Stock updated to 10');
