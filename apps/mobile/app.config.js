const { expo } = require('./app.json');

module.exports = () => {
  const isReleaseBuild = ['preview', 'production'].includes(
    process.env.BUILD_ENV || process.env.EAS_BUILD_PROFILE || '',
  );
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (isReleaseBuild) {
    let parsedUrl;
    try {
      parsedUrl = new URL(apiUrl);
    } catch {
      throw new Error('Release builds require EXPO_PUBLIC_API_URL to be a valid HTTPS URL.');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Release builds require EXPO_PUBLIC_API_URL to use HTTPS.');
    }
  }

  return expo;
};
