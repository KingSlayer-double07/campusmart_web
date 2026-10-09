// e2e runs sign uploads and check image URLs against a test Cloudinary account. No request ever
// reaches Cloudinary: signing is local, and suites spy on CloudinaryService.destroy.
process.env.CLOUDINARY_CLOUD_NAME ??= 'campusmart-test';
process.env.CLOUDINARY_API_KEY ??= '000000000000000';
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-not-real';
