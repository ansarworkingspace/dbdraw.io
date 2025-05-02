"use client"

import React from 'react';

interface SideBarProps {
  schemaInput: string;
  setSchemaInput: (value: string) => void;
}

const initialSchema = `const DriverSchema = new Schema({
  name: String,
  license: String
});

const TripSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: 'Driver' },
  destination: String
});`;

const SideBar = ({ schemaInput, setSchemaInput }: SideBarProps) => {
  React.useEffect(() => {
    // Try to get saved schema from localStorage
    const savedSchema = localStorage.getItem('mongoSchema');
    
    if (savedSchema) {
      // If there's a saved schema, use it
      setSchemaInput(savedSchema);
    } else if (!schemaInput) {
      // If no saved schema and no current input, use initial schema
      setSchemaInput(initialSchema);
      localStorage.setItem('mongoSchema', initialSchema);
    }
  }, []);

  const handleSchemaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setSchemaInput(newValue);
    // Save to localStorage whenever the schema changes
    localStorage.setItem('mongoSchema', newValue);
  };

  return (
    <div className="w-1/3 h-screen bg-gray-100 p-4 text-black">
      <textarea
        className="w-full h-[90vh] p-4 font-mono text-sm border rounded"
        value={schemaInput}
        onChange={handleSchemaChange}
      />
    </div>
  )
}

export default SideBar