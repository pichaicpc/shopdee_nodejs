const swaggerAutogen = require("swagger-autogen")();

const doc = {
  info: {
    title: "My Express API",
    description: "Automatically generated Swagger documentation",
    version: "1.0.0",
  },
  host: "localhost:4000",
  schemes: ["http"],
};

const outputFile = "./swagger-output.json"; // Output file
const endpointsFiles = ["./server.js"]; // Files containing API routes

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  require("./server"); // Run the server after docs are generated
});
