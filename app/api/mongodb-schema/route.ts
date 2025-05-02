// File: app/api/mongodb-schema/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient, Db } from "mongodb";

// Helper function to convert MongoDB field type to more readable format
function getFieldType(value: any): string {
  if (value === null || value === undefined) return "Mixed";

  const type = typeof value;

  if (type === "object") {
    if (Array.isArray(value)) {
      return value.length > 0 ? `Array of ${getFieldType(value[0])}` : "Array";
    }
    if (value instanceof Date) return "Date";
    if (value instanceof RegExp) return "RegExp";
    if (value._bsontype === "ObjectID" || value._bsontype === "ObjectId")
      return "ObjectId";
    if (Object.keys(value).length > 0) return "Object";
    return "Object";
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

// Function to infer referenced collections from field names
function inferReferences(
  fieldName: string,
  collections: string[]
): string | null {
  // Check if field ends with 'Id' or '_id'
  if (fieldName.endsWith("Id") || fieldName.endsWith("_id")) {
    // Extract potential collection name
    let potentialCollection: string;

    if (fieldName.endsWith("Id")) {
      // Convert 'userId' to 'User'
      potentialCollection = fieldName.substring(0, fieldName.length - 2);
      potentialCollection =
        potentialCollection.charAt(0).toUpperCase() +
        potentialCollection.slice(1);
    } else {
      // Convert 'user_id' to 'User'
      potentialCollection = fieldName.substring(0, fieldName.length - 3);
      potentialCollection =
        potentialCollection.charAt(0).toUpperCase() +
        potentialCollection.slice(1);
    }

    // Check if similar collection exists (case insensitive)
    const matchingCollection = collections.find(
      (c) =>
        c.toLowerCase() === potentialCollection.toLowerCase() ||
        c.toLowerCase() === potentialCollection.toLowerCase() + "s"
    );

    if (matchingCollection) {
      return matchingCollection;
    }
  }

  return null;
}

async function analyzeMongoDB(
  connectionString: string,
  dbName?: string
): Promise<any> {
  let client: MongoClient | null = null;

  try {
    client = new MongoClient(connectionString);
    await client.connect();
    console.log("Connected to MongoDB");

    // Use provided dbName or extract from connection string
    let database: Db;
    if (dbName) {
      database = client.db(dbName);
    } else {
      // Extract database name from connection string if not provided
      const connectionParts = connectionString.split("/");
      const extractedDbName =
        connectionParts[connectionParts.length - 1].split("?")[0];
      database = client.db(extractedDbName);
    }

    // Get all collections
    const collections = await database.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const schemas = [];

    // For each collection, sample documents to infer schema
    for (const collectionName of collectionNames) {
      // Skip system collections
      if (collectionName.startsWith("system.")) continue;

      const collection = database.collection(collectionName);

      // Sample documents to infer schema
      const sampleDocs = await collection.find().limit(10).toArray();

      if (sampleDocs.length === 0) {
        // Empty collection, add placeholder
        schemas.push({
          collection: collectionName,
          fields: {},
          references: {},
        });
        continue;
      }

      // Combine fields from all sampled documents
      const fields: Record<string, string> = {};
      const references: Record<string, string> = {};

      sampleDocs.forEach((doc) => {
        Object.entries(doc).forEach(([fieldName, value]) => {
          // Skip _id field as it's common to all documents
          if (fieldName === "_id") return;

          // Check if field might be a reference to another collection
          if (
            (typeof value === "object" &&
              value !== null &&
              (value._bsontype === "ObjectID" ||
                value._bsontype === "ObjectId")) ||
            fieldName.endsWith("Id") ||
            fieldName.endsWith("_id")
          ) {
            const refCollection = inferReferences(fieldName, collectionNames);
            if (refCollection) {
              references[fieldName] = refCollection;
              return;
            }
          }

          // Otherwise, store the field type
          if (!fields[fieldName]) {
            fields[fieldName] = getFieldType(value);
          }
        });
      });

      schemas.push({
        collection: collectionName,
        fields,
        references,
      });
    }

    return {
      success: true,
      schemas,
    };
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log("MongoDB connection closed");
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionString, dbName } = body;

    if (!connectionString) {
      return NextResponse.json(
        { message: "Connection string is required" },
        { status: 400 }
      );
    }

    const result = await analyzeMongoDB(connectionString, dbName);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in MongoDB schema analysis:", error);

    return NextResponse.json(
      {
        message:
          error.message || "An error occurred while connecting to MongoDB",
      },
      { status: 500 }
    );
  }
}
