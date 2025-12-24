import mongoose from "mongoose";

// Connect to MongoDB with retry logic to handle transient DNS/timeouts
const connectDB = async (retries = 5, waitMs = 5000) => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MONGO_URI is not set. Please set it in your environment (e.g. .env).');
    return;
  }

  // Mongoose v6+ ignores the old `useNewUrlParser` and `useUnifiedTopology` options.
  // Keep timeouts to help short-circuit during network/DNS issues.
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
      // Provide richer diagnostics for common DNS/timeout failures (e.g. queryTxt ETIMEOUT)
      const msg = error && error.message ? error.message : String(error);
      console.error(`MongoDB connection attempt ${attempt} failed:`, msg);

      // Detect common DNS / SRV lookup failures and print actionable hints
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
        // Do not call process.exit here so nodemon/dev server can remain up for faster debugging.
        // The application will likely not function correctly without DB but leaving the process
        // running makes it easier to inspect logs and apply fixes.
        return;
      }
    }
  }
};

export default connectDB;