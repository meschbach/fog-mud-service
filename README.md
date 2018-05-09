# Fog Mud Storage System

A network-based system for abstracting out unstructured data.  The goal is to provide the ability for build a number of
applications which are agnostic to the location of the data they work one while providing redundancy and encryption.
For example, this could store a repository of your personal pictures, which would then be backed up transparently and 
securely to a provider such as Dropbox.  For viewing your images you could build an application which transparently
scales the images, having Mud orchestrate the dance with which images are cached and where.

## Current State

The application is currently able to store and retrieve values.

## Client Perspective

From a client's perspective they connect to the network exposed service.  The client then request storage or retrieval
from a container and key.  Containers are intended to contain defaults regarding the data they are holding, including
access policies and integrations.  Keys are just names within the system.

## Service Achitecture

There are three tiers to the application: the client interface service, the metadata service, and storage services.  All
clients should be communicating with the client interface.  This will interpret client requests, deal with chunking,
compression, etc.  The _metadata_ service is responsible for manging container infromation and making decisions on where
data will rest.  _Storage_ services will accept blocks from a client interface to sotre and retreive.

Ideally you would only need a single client interface and metadata service.  You would have one storage service running
on the device with the disk you wish to hold the data.