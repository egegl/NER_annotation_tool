set -ex

if [ -d "out" ]; then
  rm -r out
fi
npm run build

if [ ! -d "../../nginx/html" ]; then
  echo "Error: ../../nginx/html directory does not exist."
  exit 1
fi

if [ -d "../../nginx/html/NER_annotation_tool" ]; then
  rm -r ../../nginx/html/NER_annotation_tool
fi

cp -r out ../../nginx/html/NER_annotation_tool
