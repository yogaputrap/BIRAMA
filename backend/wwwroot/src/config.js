// OAuth client configuration for BIRAMA frontend.
// Set the public Google application ID after creating an OAuth client in Google Cloud.
// Never put client secrets in frontend files. The Google access token is verified by the API.
window.AUTH_CONFIG = {
  googleClientId: '537440103308-64p37id0pj7v93b822gjgd6d61l96v69.apps.googleusercontent.com',
  adminEmails: [] // Admin access is controlled by the API AdminGrant table.
};
