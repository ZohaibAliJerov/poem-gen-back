// utils/ipUtils.js
const getClientIP = (req) => {
    // Check for Cloudflare
    const cloudflareIP = req.headers['cf-connecting-ip'];
    if (cloudflareIP) return cloudflareIP;
  
    // Check for standard forwarded IP
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Get the first IP in case of multiple proxies
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      return ips[0];
    }
  
    // Check for other proxy headers
    const realIP = req.headers['x-real-ip'];
    if (realIP) return realIP;
  
    // Get direct socket IP
    const socketIP = req.socket.remoteAddress;
    
    // Handle localhost IPv6
    if (socketIP === '::1' || socketIP === '::ffff:127.0.0.1') {
      return '127.0.0.1';
    }
  
    // Handle IPv6 to IPv4 mapped addresses
    if (socketIP && socketIP.startsWith('::ffff:')) {
      return socketIP.substring(7);
    }
  
    return socketIP || '127.0.0.1';
  };
  
  module.exports = { getClientIP };