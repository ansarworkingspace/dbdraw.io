"use client"

import React, { useState } from 'react'
import SideBar from '../app_component/SiderBar'
import Board from '../app_component/Board'

const Page = () => {
  const [schemaInput, setSchemaInput] = useState('');

  return (
    <div className="flex w-full h-screen bg-black">
      <SideBar schemaInput={schemaInput} setSchemaInput={setSchemaInput} />
      <Board schemaInput={schemaInput} />
    </div>
  )
}

export default Page