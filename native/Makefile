CC ?= cc
CFLAGS ?= -D_POSIX_C_SOURCE=200809L -std=c11 -O2 -Wall -Wextra -Wpedantic
LDFLAGS ?=

BIN = wsps_udp_listener
OBJS = wsps_udp_main.o wsps_udp_reader.o

all: $(BIN)

$(BIN): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS) $(LDFLAGS)

wsps_udp_main.o: wsps_udp_main.c wsps_udp_reader.h
	$(CC) $(CFLAGS) -c wsps_udp_main.c

wsps_udp_reader.o: wsps_udp_reader.c wsps_udp_reader.h
	$(CC) $(CFLAGS) -c wsps_udp_reader.c

clean:
	rm -f $(BIN) $(OBJS)

.PHONY: all clean
