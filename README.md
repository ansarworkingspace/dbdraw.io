# MongoDB Schema Visualizer - Direct Connection Feature

This document explains how to implement a MongoDB connection feature for the Schema Visualizer tool, allowing users to extract and visualize their database schemas directly from their MongoDB instances.

## Implementation Overview

The feature consists of two main components:

1. **Frontend UI** - A modal dialog that allows users to input their MongoDB connection string and optionally specify a database name.
2. **Backend API** - An endpoint that securely connects to the MongoDB instance, analyzes collections and documents to infer schemas, and returns structured schema data.

## Security Considerations

When implementing this feature in a production environment, consider the following security practices:

### 1. Connection String Handling

- **Never store connection strings** in browser localStorage, cookies, or client-side code.
- Implement proper **input validation** to prevent injection attacks.
- Consider allowing users to **upload a configuration file** instead of directly typing connection strings.

### 2. Backend Security

- Use **environment variables** for any sensitive configuration.
- Implement **rate limiting** to prevent abuse of the API endpoint.
- Add **authentication and authorization** to ensure only legitimate users can use this feature.
- Consider implementing a **proxy service** to avoid exposing MongoDB credentials.
- Apply **restrictive permissions** - use read-only accounts for schema extraction.

### 3. Data Privacy

- Don't extract or return actual document data, only schema information.
- Consider offering an option to **exclude certain collections** from analysis.
- Implement **data masking** for sensitive field names.

## Setup Instructions

1. Install the MongoDB driver:

   ```bash
   npm install mongodb
   ```

2. Add the API route and Board component files to your project.

3. Configure your Next.js API route handling for MongoDB connections.

4. Update your environment configuration to handle MongoDB connections safely.

## Feature Usage

Users can visualize their MongoDB schemas in two ways:

1. **Manual Entry**: Paste Mongoose schema code in the sidebar
2. **Direct Connection**: Connect directly to a MongoDB instance

To use the direct connection feature:

1. Click "Connect to MongoDB" in the diagram toolbar
2. Enter a valid MongoDB connection string
3. Optionally specify a database name
4. Click "Connect" to extract and visualize the schema

## How Schema Inference Works

The API analyzes MongoDB collections by:

1. Sampling documents from each collection
2. Determining field types from the sample data
3. Inferring relationships between collections based on field names and ObjectId references
4. Constructing a schema representation that can be visualized

## Limitations

- Schema inference is based on document samples, so it may not detect all field types if they don't appear in the sample.
- Relationship detection is based on naming conventions and may not identify all relationships.
- The tool doesn't detect or represent indexes, validators, or other MongoDB schema features.

## Future Improvements

- Support for authentication options beyond connection strings
- Schema comparison between development and production environments
- Support for more complex relationship types
- Export functionality to generate Mongoose schemas from MongoDB collections
- Support for MongoDB Atlas Data API
