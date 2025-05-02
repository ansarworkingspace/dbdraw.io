"use client"
import React, { useEffect, useState, useRef, useCallback } from 'react'

interface SchemaNode {
  name: string;
  fields: { [key: string]: string };
  refs: { [key: string]: string };
  position?: { x: number; y: number };
}

interface BoardProps {
  schemaInput: string;
}

const Board = ({ schemaInput }: BoardProps) => {
  // Existing state variables
  const [schemas, setSchemas] = useState<SchemaNode[]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeSchema, setActiveSchema] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  
  // Added for MongoDB connection feature
  const [connectionString, setConnectionString] = useState<string>('');
  const [dbName, setDbName] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showConnectionModal, setShowConnectionModal] = useState<boolean>(false);

  // UPDATE HERE - Add new state variables for enhanced zoom and navigation
  const [boardBounds, setBoardBounds] = useState({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [miniMapDragging, setMiniMapDragging] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100); // For zoom percentage display
  const [showZoomControls, setShowZoomControls] = useState(true);
  const minimapRef = useRef<HTMLDivElement>(null);
  const viewportSize = useRef({ width: 0, height: 0 });

  // Parse schema input
  useEffect(() => {
    if (!schemaInput) return;
    
    try {
      // Improved regex patterns for MongoDB/Mongoose schemas
      const schemaRegex = /const\s+(\w+)Schema\s+=\s+new\s+Schema\(\{([\s\S]+?)\}\);/g;
      const fieldRegex = /(\w+):\s*(?:{[^}]*type:\s*Schema\.Types\.ObjectId,\s*ref:\s*'(\w+)'[^}]*}|{[^}]+}|[^,\n]+)/g;
      
      const parsedSchemas: SchemaNode[] = [];
      let match;

      while ((match = schemaRegex.exec(schemaInput)) !== null) {
        const [_, name, fieldsStr] = match;
        const fields: { [key: string]: string } = {};
        const refs: { [key: string]: string } = {};
        
        let fieldMatch;
        const fieldsText = fieldsStr.trim();
        
        while ((fieldMatch = fieldRegex.exec(fieldsText)) !== null) {
          const [_, fieldName, refModel] = fieldMatch;
          if (refModel) {
            refs[fieldName] = refModel;
          } else {
            const fieldType = fieldMatch[0].split(':')[1].trim();
            fields[fieldName] = fieldType.replace(/,\s*$/, '').replace(/^{[^}]*type:\s*([^,}]+).*}$/, '$1');
          }
        }
        
        parsedSchemas.push({ 
          name, 
          fields, 
          refs,
          position: {
            x: 100 + Math.random() * 400,
            y: 100 + Math.random() * 200
          }
        });
      }
      
      // Layout schemas in a more organized way
      const layoutSchemas = (schemas: SchemaNode[]): SchemaNode[] => {
        // First, create a dependency graph
        const graph: {[key: string]: string[]} = {};
        schemas.forEach(schema => {
          graph[schema.name] = [];
          Object.values(schema.refs).forEach(refTarget => {
            if (!graph[refTarget]) {
              graph[refTarget] = [];
            }
            graph[schema.name].push(refTarget);
          });
        });
        
        // Position schemas in columns based on dependency levels
        const positioned = new Set<string>();
        const result = [...schemas];
        
        // Find schemas with no dependencies (root schemas)
        const rootSchemas = schemas.filter(s => 
          !schemas.some(other => Object.values(other.refs).includes(s.name))
        ).map(s => s.name);
        
        // Layout function for positioning schemas
        const layoutByLevel = (schemaNames: string[], level: number, column: number) => {
          const ySpacing = 250;
          const xSpacing = 400;
          
          schemaNames.forEach((name, idx) => {
            if (positioned.has(name)) return;
            
            const schemaIndex = result.findIndex(s => s.name === name);
            if (schemaIndex >= 0) {
              result[schemaIndex].position = {
                x: 100 + column * xSpacing,
                y: 100 + idx * ySpacing
              };
              positioned.add(name);
              
              // Layout the next level
              if (graph[name] && graph[name].length > 0) {
                layoutByLevel(graph[name], level + 1, column + 1);
              }
            }
          });
        };
        
        layoutByLevel(rootSchemas, 0, 0);
        
        // Position any remaining unpositioned schemas
        const xSpacing = 400;
        let lastColumn = 0;
        
        result.forEach(schema => {
          if (!positioned.has(schema.name)) {
            const y = 100 + (positioned.size % 4) * 250;
            schema.position = {
              x: 100 + lastColumn * xSpacing,
              y: y
            };
            positioned.add(schema.name);
          } else if (schema.position && schema.position.x > lastColumn * xSpacing) {
            lastColumn = Math.floor(schema.position.x / xSpacing);
          }
        });
        
        return result;
      };
      
      const layoutedSchemas = layoutSchemas(parsedSchemas);
      setSchemas(layoutedSchemas);
      
      // UPDATE HERE - Calculate board boundaries after layout
      calculateBoardBounds(layoutedSchemas);
    } catch (error) {
      console.error('Error parsing schema:', error);
    }
  }, [schemaInput]);

  // UPDATE HERE - Calculate board boundaries 
  const calculateBoardBounds = useCallback((schemaNodes: SchemaNode[]) => {
    if (schemaNodes.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    schemaNodes.forEach(schema => {
      if (schema.position) {
        // Each schema box is approximately 250px wide and varies in height based on fields
        const schemaWidth = 250;
        const schemaHeight = 50 + (Object.keys(schema.fields).length + Object.keys(schema.refs).length) * 24;
        
        minX = Math.min(minX, schema.position.x);
        minY = Math.min(minY, schema.position.y);
        maxX = Math.max(maxX, schema.position.x + schemaWidth);
        maxY = Math.max(maxY, schema.position.y + schemaHeight);
      }
    });
    
    // Add padding around the bounds
    const padding = 200;
    setBoardBounds({
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    });
  }, []);

  // UPDATE HERE - Update viewport size on component mount and resize
  useEffect(() => {
    const updateViewportSize = () => {
      if (boardRef.current) {
        viewportSize.current = {
          width: boardRef.current.clientWidth,
          height: boardRef.current.clientHeight
        };
      }
    };
    
    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    
    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);

  // UPDATE HERE - Enhanced zoom functionality
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); // Always prevent default to avoid page scrolling
    
    // Get mouse position relative to the board
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse position to board coordinates (before zoom change)
    const boardX = (mouseX / scale) - offset.x;
    const boardY = (mouseY / scale) - offset.y;
    
    // Calculate new scale
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // More gradual zoom
    const newScale = Math.min(Math.max(0.1, scale * zoomFactor), 5); // Wider zoom range
    
    // Calculate new offset to zoom toward/from mouse position
    const newOffsetX = -(boardX * newScale) + mouseX;
    const newOffsetY = -(boardY * newScale) + mouseY;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
    setZoomLevel(Math.round(newScale * 100));
  };

  // UPDATE HERE - Zoom to fit all schemas
  const zoomToFit = useCallback(() => {
    if (!boardRef.current || schemas.length === 0) return;
    
    const { width, height } = viewportSize.current;
    const boundWidth = boardBounds.maxX - boardBounds.minX;
    const boundHeight = boardBounds.maxY - boardBounds.minY;
    
    // Calculate scale to fit the entire diagram
    const scaleX = width / boundWidth;
    const scaleY = height / boundHeight;
    const newScale = Math.min(scaleX, scaleY) * 0.9; // 90% of the calculated scale for some padding
    
    // Center the diagram
    const newOffsetX = (width / 2) - ((boundWidth * newScale) / 2) - (boardBounds.minX * newScale);
    const newOffsetY = (height / 2) - ((boundHeight * newScale) / 2) - (boardBounds.minY * newScale);
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
    setZoomLevel(Math.round(newScale * 100));
  }, [boardBounds, schemas.length]);

  // UPDATE HERE - Auto-zoom to fit on initial load
  useEffect(() => {
    if (schemas.length > 0 && boardBounds.maxX > 0) {
      zoomToFit();
    }
  }, [schemas.length, boardBounds, zoomToFit]);

  // UPDATE HERE - MiniMap interactions
  const handleMiniMapMouseDown = (e: React.MouseEvent) => {
    if (!minimapRef.current) return;
    e.stopPropagation();
    
    const rect = minimapRef.current.getBoundingClientRect();
    const miniMapWidth = rect.width;
    const miniMapHeight = rect.height;
    
    const miniMapX = e.clientX - rect.left;
    const miniMapY = e.clientY - rect.top;
    
    // Calculate board width and height
    const boardWidth = boardBounds.maxX - boardBounds.minX;
    const boardHeight = boardBounds.maxY - boardBounds.minY;
    
    // Calculate viewport center in board coordinates
    const viewportCenterX = (miniMapX / miniMapWidth) * boardWidth + boardBounds.minX;
    const viewportCenterY = (miniMapY / miniMapHeight) * boardHeight + boardBounds.minY;
    
    // Calculate new offset to center viewport on this point
    const viewportHalfWidth = viewportSize.current.width / (2 * scale);
    const viewportHalfHeight = viewportSize.current.height / (2 * scale);
    
    const newOffsetX = -viewportCenterX + viewportHalfWidth;
    const newOffsetY = -viewportCenterY + viewportHalfHeight;
    
    setOffset({ x: newOffsetX, y: newOffsetY });
    setMiniMapDragging(true);
  };

  const handleMiniMapMouseMove = (e: React.MouseEvent) => {
    if (!miniMapDragging || !minimapRef.current) return;
    
    const rect = minimapRef.current.getBoundingClientRect();
    const miniMapWidth = rect.width;
    const miniMapHeight = rect.height;
    
    const miniMapX = Math.max(0, Math.min(e.clientX - rect.left, miniMapWidth));
    const miniMapY = Math.max(0, Math.min(e.clientY - rect.top, miniMapHeight));
    
    // Calculate board width and height
    const boardWidth = boardBounds.maxX - boardBounds.minX;
    const boardHeight = boardBounds.maxY - boardBounds.minY;
    
    // Calculate viewport center in board coordinates
    const viewportCenterX = (miniMapX / miniMapWidth) * boardWidth + boardBounds.minX;
    const viewportCenterY = (miniMapY / miniMapHeight) * boardHeight + boardBounds.minY;
    
    // Calculate new offset to center viewport on this point
    const viewportHalfWidth = viewportSize.current.width / (2 * scale);
    const viewportHalfHeight = viewportSize.current.height / (2 * scale);
    
    const newOffsetX = -viewportCenterX + viewportHalfWidth;
    const newOffsetY = -viewportCenterY + viewportHalfHeight;
    
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleMiniMapMouseUp = () => {
    setMiniMapDragging(false);
  };
  useEffect(() => {
    if (schemas.length > 0) {
      calculateBoardBounds(schemas);
    }
  }, [schemas, calculateBoardBounds]);
  // Function to fetch schemas from MongoDB using connection string
  const fetchSchemasFromMongoDB = async () => {
    if (!connectionString) {
      setConnectionError('Connection string is required');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      // Call API endpoint to fetch schemas
      const response = await fetch('/api/mongodb-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionString,
          dbName: dbName || undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to connect to database');
      }
      
      const data = await response.json();
      
      // Transform the API response to our schema format
      if (data.schemas && Array.isArray(data.schemas)) {
        const transformedSchemas: SchemaNode[] = data.schemas.map((schema: any) => ({
          name: schema.collection,
          fields: schema.fields || {},
          refs: schema.references || {},
          position: {
            x: 100 + Math.random() * 400,
            y: 100 + Math.random() * 200
          }
        }));
        
        // Apply the same layout algorithm
        const layoutSchemas = (schemas: SchemaNode[]): SchemaNode[] => {
          // Same layout algorithm as above...
          // First, create a dependency graph
          const graph: {[key: string]: string[]} = {};
          schemas.forEach(schema => {
            graph[schema.name] = [];
            Object.values(schema.refs).forEach(refTarget => {
              if (!graph[refTarget]) {
                graph[refTarget] = [];
              }
              graph[schema.name].push(refTarget);
            });
          });
          
          // Position schemas in columns based on dependency levels
          const positioned = new Set<string>();
          const result = [...schemas];
          
          // Find schemas with no dependencies (root schemas)
          const rootSchemas = schemas.filter(s => 
            !schemas.some(other => Object.values(other.refs).includes(s.name))
          ).map(s => s.name);
          
          // Layout function for positioning schemas
          const layoutByLevel = (schemaNames: string[], level: number, column: number) => {
            const ySpacing = 250;
            const xSpacing = 400;
            
            schemaNames.forEach((name, idx) => {
              if (positioned.has(name)) return;
              
              const schemaIndex = result.findIndex(s => s.name === name);
              if (schemaIndex >= 0) {
                result[schemaIndex].position = {
                  x: 100 + column * xSpacing,
                  y: 100 + idx * ySpacing
                };
                positioned.add(name);
                
                // Layout the next level
                if (graph[name] && graph[name].length > 0) {
                  layoutByLevel(graph[name], level + 1, column + 1);
                }
              }
            });
          };
          
          layoutByLevel(rootSchemas, 0, 0);
          
          // Position any remaining unpositioned schemas
          const xSpacing = 400;
          let lastColumn = 0;
          
          result.forEach(schema => {
            if (!positioned.has(schema.name)) {
              const y = 100 + (positioned.size % 4) * 250;
              schema.position = {
                x: 100 + lastColumn * xSpacing,
                y: y
              };
              positioned.add(schema.name);
            } else if (schema.position && schema.position.x > lastColumn * xSpacing) {
              lastColumn = Math.floor(schema.position.x / xSpacing);
            }
          });
          
          return result;
        };
        
        const layoutedSchemas = layoutSchemas(transformedSchemas);
        setSchemas(layoutedSchemas);
        calculateBoardBounds(layoutedSchemas);
        setShowConnectionModal(false);
        
        // Auto zoom to fit after receiving the schemas
        setTimeout(zoomToFit, 100);
      } else {
        throw new Error('Invalid schema data received from API');
      }
    } catch (error) {
      console.error('Error fetching MongoDB schemas:', error);
      setConnectionError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsConnecting(false);
    }
  };

  // Pan functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === boardRef.current || (e.target as Element).classList.contains('board-background')) {
      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setOffset(prev => ({ x: prev.x + dx / scale, y: prev.y + dy / scale }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };



  const handleSchemaMouseDown = (e: React.MouseEvent, schemaName: string) => {
    e.stopPropagation();
    setActiveSchema(schemaName);
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  const handleSchemaMouseMove = (e: React.MouseEvent) => {
    if (activeSchema && schemas.length > 0) {
      e.stopPropagation();
      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;
      
      setSchemas(prevSchemas => 
        prevSchemas.map(schema => 
          schema.name === activeSchema && schema.position
            ? { 
                ...schema, 
                position: { 
                  x: schema.position.x + dx, 
                  y: schema.position.y + dy 
                } 
              }
            : schema
        )
      );
      
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };
  
  const handleSchemaMouseUp = () => {
    setActiveSchema(null);
  };



  // Get Y position of a specific field in a schema
  const getFieldYPosition = (schema: SchemaNode, fieldName: string) => {
    let baseY = schema.position!.y + 40; // Header height
    
    // Check if it's the _id field (default MongoDB field)
    if (fieldName === '_id') {
      return baseY + 15; // Position at first row
    }
    
    // Find position in regular fields
    const fieldNames = Object.keys(schema.fields);
    const fieldIndex = fieldNames.indexOf(fieldName);
    if (fieldIndex >= 0) {
      return baseY + 15 + ((fieldIndex + 1) * 24); // Each row is ~24px high, +1 for _id row
    }
    
    // Find position in refs
    const refNames = Object.keys(schema.refs);
    const refIndex = refNames.indexOf(fieldName);
    if (refIndex >= 0) {
      return baseY + 15 + ((fieldNames.length + 1) * 24) + (refIndex * 24); // +1 for _id row
    }
    
    // Default position if not found
    return baseY + 15;
  };

  // Generate a unique identifier for a connection
  const getConnectionId = (sourceSchema: string, fieldName: string, targetSchema: string) => {
    return `${sourceSchema}-${fieldName}-${targetSchema}`;
  };

  // Calculate connection paths between schemas (field to field)
  const renderConnections = () => {
    const connections: React.ReactNode[] = [];
    
    schemas.forEach(sourceSchema => {
      Object.entries(sourceSchema.refs).forEach(([fieldName, targetSchemaName]) => {
        const targetSchema = schemas.find(s => s.name === targetSchemaName);
        if (targetSchema && sourceSchema.position && targetSchema.position) {
          const connectionId = getConnectionId(sourceSchema.name, fieldName, targetSchema.name);
          const isHighlighted = hoveredConnection === connectionId;
          
          // Source field position (where the reference is defined)
          const sourceFieldY = getFieldYPosition(sourceSchema, fieldName);
          
          // Target field position (typically _id in the referenced model)
          const targetFieldY = getFieldYPosition(targetSchema, '_id');
          
          // Connection coordinates
          const startX = sourceSchema.position.x + 250; // Right edge of source schema
          const startY = sourceFieldY;
          const endX = targetSchema.position.x; // Left edge of target schema
          const endY = targetFieldY;
          
          // Distance between schemas
          const distance = Math.abs(endX - startX);
          
          // Different path styles based on distance
          let path;
          let labelX;
          let labelY;
          
          if (distance > 300) {
            // Use a curved line for longer distances
            const controlPointDistance = Math.min(150, distance * 0.4);
            
            path = `M ${startX} ${startY} 
                    C ${startX + controlPointDistance} ${startY}, 
                      ${endX - controlPointDistance} ${endY}, 
                      ${endX} ${endY}`;
                      
            labelX = (startX + endX) / 2;
            labelY = ((startY + endY) / 2) - 15;
          } else {
            // Use a more direct path for shorter distances
            const midX = (startX + endX) / 2;
            
            path = `M ${startX} ${startY} 
                    L ${midX} ${startY}
                    L ${midX} ${endY}
                    L ${endX} ${endY}`;
                    
            labelX = midX;
            labelY = (startY < endY) 
              ? startY + ((endY - startY) / 2) - 10
              : endY + ((startY - endY) / 2) - 10;
          }
          
          connections.push(
            <g 
              key={connectionId}
              className="connection-group"
              onMouseEnter={() => setHoveredConnection(connectionId)}
              onMouseLeave={() => setHoveredConnection(null)}
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
            >
              {/* Invisible wider path for easier hover */}
              <path 
                d={path}
                fill="none"
                stroke="transparent" 
                strokeWidth="10"
              />
              
              {/* Visible path */}
              <path 
                d={path}
                fill="none"
                stroke={isHighlighted ? "#1e40af" : "#3b82f6"} 
                strokeWidth={isHighlighted ? "3" : "2"}
                strokeDasharray={isHighlighted ? "none" : "5,5"}
                markerEnd={isHighlighted ? "url(#arrowhead-highlighted)" : "url(#arrowhead)"}
                style={{
                  transition: "stroke 0.2s ease, stroke-width 0.2s ease, stroke-dasharray 0.2s ease"
                }}
              />
              
              {/* Connection indicators on fields */}
              <circle 
                cx={startX} 
                cy={startY} 
                r={isHighlighted ? 5 : 3}
                fill={isHighlighted ? "#1e40af" : "#3b82f6"} 
                style={{ transition: "r 0.2s ease, fill 0.2s ease" }}
              />
              
              <circle 
                cx={endX} 
                cy={endY} 
                r={isHighlighted ? 5 : 3}
                fill={isHighlighted ? "#1e40af" : "#3b82f6"} 
                style={{ transition: "r 0.2s ease, fill 0.2s ease" }}
              />
              
              {/* Connection label */}
              <g>
                <rect
                  x={labelX - 50}
                  y={labelY - 10}
                  width="100"
                  height="20"
                  rx="4"
                  fill={isHighlighted ? "#dbeafe" : "white"}
                  stroke={isHighlighted ? "#1e40af" : "#3b82f6"}
                  strokeWidth="1"
                  style={{ transition: "fill 0.2s ease, stroke 0.2s ease" }}
                />
                <text 
                  x={labelX} 
                  y={labelY + 5} 
                  textAnchor="middle" 
                  fill={isHighlighted ? "#1e40af" : "#3b82f6"}
                  fontSize="12"
                  fontWeight={isHighlighted ? "bold" : "normal"}
                  style={{ transition: "fill 0.2s ease, font-weight 0.2s ease" }}
                >
                  {`${sourceSchema.name}.${fieldName} → ${targetSchema.name}`}
                </text>
              </g>
            </g>
          );
        }
        return null;
      });
    });
    
    return connections;
  };

  // Highlight related fields when hovering over a schema
  const getHighlightedFields = (schemaName: string) => {
    const relatedFields = new Set<string>();
    
    // Find fields in this schema that reference other schemas
    schemas.find(s => s.name === schemaName)?.refs && 
      Object.keys(schemas.find(s => s.name === schemaName)!.refs).forEach(field => {
        relatedFields.add(field);
      });
    
    // Find fields in other schemas that reference this schema
    schemas.forEach(schema => {
      Object.entries(schema.refs).forEach(([field, ref]) => {
        if (ref === schemaName) {
          relatedFields.add(`${schema.name}.${field}`);
        }
      });
    });
    
    return relatedFields;
  };
  
  // Connection modal component
  const ConnectionModal = () => {
    if (!showConnectionModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 className="text-lg font-bold mb-4">Connect to MongoDB Database</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Connection String</label>
            <input
              type="text"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              placeholder="mongodb://username:password@host:port/database"
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: mongodb://username:password@host:port/database
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Database Name (Optional)</label>
            <input
              type="text"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
              placeholder="myDatabase"
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              If not specified, will use the database from connection string
            </p>
          </div>
          
          {connectionError && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
              {connectionError}
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowConnectionModal(false)}
              className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={fetchSchemasFromMongoDB}
              disabled={isConnecting}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // MiniMap Component for navigation
  const MiniMap = () => {
    if (!showMiniMap || schemas.length === 0) return null;
    
    const miniMapWidth = 200;
    const miniMapHeight = 150;
    const padding = 20;
    
    // Calculate scale for the minimap
    const boardWidth = boardBounds.maxX - boardBounds.minX;
    const boardHeight = boardBounds.maxY - boardBounds.minY;
    
    const scaleX = (miniMapWidth - padding * 2) / boardWidth;
    const scaleY = (miniMapHeight - padding * 2) / boardHeight;
    const miniScale = Math.min(scaleX, scaleY);
    
    // Calculate viewport rectangle in minimap coordinates
    const viewportWidth = viewportSize.current.width / scale;
    const viewportHeight = viewportSize.current.height / scale;
    
    // Current viewport bounds in board coordinates
    const viewportLeft = -offset.x;
    const viewportTop = -offset.y;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    
    // Convert to minimap coordinates
    const miniLeft = ((viewportLeft - boardBounds.minX) * miniScale) + padding;
    const miniTop = ((viewportTop - boardBounds.minY) * miniScale) + padding;
    const miniRight = ((viewportRight - boardBounds.minX) * miniScale) + padding;
    const miniBottom = ((viewportBottom - boardBounds.minY) * miniScale) + padding;
    
    // Ensure viewport rectangle stays within minimap bounds
    const boundedMiniLeft = Math.max(padding, miniLeft);
    const boundedMiniTop = Math.max(padding, miniTop);
    const boundedMiniRight = Math.min(miniMapWidth - padding, miniRight);
    const boundedMiniBottom = Math.min(miniMapHeight - padding, miniBottom);
    
    return (
      <div 
        ref={minimapRef}
        className="absolute bottom-4 right-4 bg-white border rounded shadow-md z-10 select-none"
        style={{ width: miniMapWidth, height: miniMapHeight }}
        onMouseDown={handleMiniMapMouseDown}
        onMouseMove={handleMiniMapMouseMove}
        onMouseUp={handleMiniMapMouseUp}
        onMouseLeave={handleMiniMapMouseUp}
      >
        <div className="absolute top-1 left-1 text-xs font-medium text-gray-500">
          Overview
        </div>
        
        {/* Schema boxes in minimap */}
        {schemas.map((schema) => (
          schema.position && (
            <div
              key={`mini-${schema.name}`}
              className="absolute bg-blue-100 border border-blue-300"
              style={{
                left: ((schema.position.x - boardBounds.minX) * miniScale) + padding,
                top: ((schema.position.y - boardBounds.minY) * miniScale) + padding,
                width: 20 * miniScale,
                height: 30 * miniScale,
                minWidth: 4,
                minHeight: 4
              }}
            />
          )
        ))}
        
        {/* Viewport rectangle */}
        <div
          className="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-20 cursor-move"
          style={{
            left: boundedMiniLeft,
            top: boundedMiniTop,
            width: boundedMiniRight - boundedMiniLeft,
            height: boundedMiniBottom - boundedMiniTop
          }}
        />
      </div>
    );
  };

  // Zoom controls component
  const ZoomControls = () => {
    if (!showZoomControls) return null;
    
    return (
      <div className="absolute left-4 bottom-4 bg-white rounded shadow-md border z-10 flex flex-col">
        <button 
          className="p-2 hover:bg-gray-100 border-b text-gray-700"
          onClick={() => {
            const newScale = Math.min(scale * 1.2, 5);
            setScale(newScale);
            setZoomLevel(Math.round(newScale * 100));
          }}
          title="Zoom In"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        
        <div className="px-2 py-1 border-b text-center text-sm font-medium">
          {zoomLevel}%
        </div>
        
        <button 
          className="p-2 hover:bg-gray-100 border-b text-gray-700"
          onClick={() => {
            const newScale = Math.max(scale / 1.2, 0.1);
            setScale(newScale);
            setZoomLevel(Math.round(newScale * 100));
          }}
          title="Zoom Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        </button>
        
        <button 
          className="p-2 hover:bg-gray-100 text-gray-700"
          onClick={zoomToFit}
          title="Fit to View"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div 
      className="w-2/3 h-screen bg-gray-50 p-4 text-black overflow-hidden"
      onWheel={handleWheel}
    >
      <div className="flex justify-between items-center mb-2 border-b pb-2">
        <h2 className="text-lg font-bold">MongoDB Schema Diagram</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center text-sm">
            <div className="flex gap-2">
              <div className="flex items-center">
                <div className="w-4 h-0 border border-blue-500 border-dashed mr-1"></div>
                <span>References</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-0 border-2 border-blue-600 mr-1"></div>
                <span>Selected</span>
              </div>
            </div>
          </div>
          <div className="space-x-2">
            <button 
              className="px-2 py-1 bg-blue-500 text-white rounded text-sm"
              onClick={() => setShowConnectionModal(true)}
            >
              Connect to MongoDB
            </button>
            <button 
              className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
              onClick={() => setShowMiniMap(!showMiniMap)}
              title="Toggle Mini Map"
            >
              {showMiniMap ? 'Hide Mini Map' : 'Show Mini Map'}
            </button>
            <button 
              className="px-2 py-1 bg-gray-500 text-white rounded text-sm"
              onClick={zoomToFit}
            >
              Fit to View
            </button>
          </div>
        </div>
      </div>
      
      <div 
  ref={boardRef}
  className="w-full h-5/6 border rounded p-4 relative bg-white overflow-hidden cursor-grab"
  style={{ boxShadow: "inset 0 0 10px rgba(0,0,0,0.1)" }}
  onMouseDown={handleMouseDown}
  onMouseUp={handleMouseUp}
  onMouseLeave={handleMouseUp}
  onMouseMove={(e) => {
    if (dragging) {
      handleMouseMove(e);
    } else if (activeSchema) {
      handleSchemaMouseMove(e);
    }
  }}
>
        <div 
          className="board-background absolute inset-0 w-full h-full"
          style={{
            backgroundImage: "radial-gradient(#e5e7eb 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        ></div>
        
        <div
          className="relative w-full h-full"
          style={{
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: '0 0',
            transition: dragging || activeSchema ? 'none' : 'transform 0.1s ease-out'
          }}
          onMouseUp={handleSchemaMouseUp}
        >
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
              </marker>
              <marker
                id="arrowhead-highlighted"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#1e40af" />
              </marker>
            </defs>
            {renderConnections()}
          </svg>
          
          {schemas.map((schema) => {
            const isActive = activeSchema === schema.name;
            const highlightedFields = isActive ? getHighlightedFields(schema.name) : new Set<string>();
            
            return (
                <div 
                key={schema.name} 
                className={`absolute rounded-lg shadow-lg min-w-[250px] cursor-move ${
                  isActive ? 'ring-2 ring-blue-600 z-10 shadow-xl' : ''
                }`}
                style={{
                  left: schema.position?.x,
                  top: schema.position?.y,
                  transition: isActive ? 'none' : 'all 0.2s ease-out'
                }}
                onMouseDown={(e) => handleSchemaMouseDown(e, schema.name)}
              >
                <div className={`px-4 py-2 rounded-t-lg font-bold ${
                  isActive ? 'bg-blue-600' : 'bg-blue-500'
                } text-white flex justify-between items-center`}>
                  <span>{schema.name}</span>
                  <span className="text-xs font-normal bg-white text-blue-800 px-2 py-0.5 rounded">
                    Collection
                  </span>
                </div>
                <div className="bg-white p-4 rounded-b-lg border-x border-b border-gray-300">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-blue-100 bg-blue-50">
                        <td className="py-1 pr-2 font-mono font-medium">_id</td>
                        <td className="py-1 text-gray-600 italic">ObjectId</td>
                        <td className="w-6 text-center">
                          {/* Connection indicator */}
                          {Object.values(schema.refs).length > 0 || 
                            schemas.some(s => Object.values(s.refs).includes(schema.name)) ? (
                            <div className="w-3 h-3 rounded-full bg-blue-400 mx-auto"></div>
                          ) : null}
                        </td>
                      </tr>
                      
                      {Object.entries(schema.fields).map(([fieldName, fieldType]) => (
                        <tr key={fieldName} className="border-b border-gray-100">
                          <td className="py-1 pr-2 font-mono font-medium">{fieldName}</td>
                          <td className="py-1 text-gray-600 italic">{fieldType}</td>
                          <td className="w-6"></td>
                        </tr>
                      ))}
                      
                      {Object.entries(schema.refs).map(([fieldName, refModel]) => {
                        const isHighlighted = highlightedFields.has(fieldName) || hoveredConnection === getConnectionId(schema.name, fieldName, refModel);
                        
                        return (
                          <tr 
                            key={fieldName} 
                            className={`border-b border-gray-100 ${
                              isHighlighted ? 'bg-blue-50' : ''
                            }`}
                            style={{ transition: 'background-color 0.2s ease' }}
                          >
                            <td className="py-1 pr-2 font-mono font-medium">
                              {fieldName}
                            </td>
                            <td className={`py-1 ${isHighlighted ? 'text-blue-700 font-medium' : 'text-blue-600'}`}>
                              → {refModel}
                            </td>
                            <td className="w-6 text-center">
                              <div className={`w-3 h-3 rounded-full ${
                                isHighlighted ? 'bg-blue-600' : 'bg-blue-400'
                              } mx-auto`}></div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        

        {/* Add the mini-map for navigation */}
        <MiniMap />
        
        {/* Add zoom controls */}
        <ZoomControls />
        
        {/* Information overlay for current zoom level */}
        <div className="absolute left-4 top-4 bg-white px-3 py-1 rounded-full shadow text-xs text-gray-600 flex items-center gap-2">
          <span>Zoom: {zoomLevel}%</span>
          <span>•</span>
          <span>Collections: {schemas.length}</span>
        </div>
      </div>
      
      <div className="mt-2 text-xs text-gray-500 flex justify-between">
        <div>
          {schemas.length > 0 ? 
            `Showing ${schemas.length} collections • Hover over connections to highlight • Drag schemas to reposition` : 
            'Enter MongoDB/Mongoose schema in the sidebar or connect directly to MongoDB'
          }
        </div>
        <div>
          <span className="text-blue-500 cursor-pointer" onClick={zoomToFit}>Fit to View</span> | 
          <span className="text-blue-500 cursor-pointer ml-2" onClick={() => setShowMiniMap(!showMiniMap)}>
            {showMiniMap ? 'Hide Mini Map' : 'Show Mini Map'}
          </span>
        </div>
      </div>
      
      {/* MongoDB Connection Modal */}
      <ConnectionModal />
    </div>
  )
}

export default Board

