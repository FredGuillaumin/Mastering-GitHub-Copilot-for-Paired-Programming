cmake_minimum_required(VERSION 3.16)
project(claude_chat CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CURL REQUIRED)
find_package(nlohmann_json 3.2 REQUIRED)

add_executable(claude_chat main.cpp)
target_link_libraries(claude_chat PRIVATE CURL::libcurl nlohmann_json::nlohmann_json)
