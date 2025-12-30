import mongoose from "mongoose";


const connectDB = async (retries = 5, waitMs = 5000) => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MONGO_URI is not set. Please set it in your environment (e.g. .env).');
    return;
  }


  const opts = {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, opts);
      console.log("MongoDB Connected...");
      return;
    } catch (error) {
      
      const msg = error && error.message ? error.message : String(error);
      console.error(`MongoDB connection attempt ${attempt} failed:`, msg);

     
      if (/queryTxt ETIMEOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
        console.error(
          'DNS/SRV lookup error detected. If you are using an `mongodb+srv://` URI, this requires DNS SRV support.'
        );
        console.error('Try the following:');
        console.error('- Verify `MONGO_URI` is correct and contains the expected cluster host.');
        console.error("- Run: `nslookup -type=SRV _mongodb._tcp.<your-cluster-host>` to check SRV records.");
        console.error('- Check local network, VPN, or corporate firewall that may block DNS or outbound connections.');
        console.error('- As a temporary test, try a standard `mongodb://host:port` connection string (no SRV).');
      }

      if (attempt < retries) {
        const backoff = waitMs * attempt;
        console.log(`Retrying MongoDB connection in ${backoff / 1000}s...`);
        await new Promise((res) => setTimeout(res, backoff));
        continue;
      } else {
        console.error(
          `Failed to connect to MongoDB after ${retries} attempts. See network/DNS/Atlas settings.`
        );
       
        return;
      }
    }
  }
};

export default connectDB;